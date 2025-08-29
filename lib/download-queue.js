const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const log = require('loglevel');
const config = require('./config');
const { getContentInfo, getContentStreamUrl, getAdditionalStreamsInfo, getContentParams, getProgramStreamId } = require('./f1tv-api');
const { isF1tvUrl, isRace } = require('./f1tv-validator');
const ffmpeg = require('fluent-ffmpeg');
const util = require('util');

class DownloadQueue extends EventEmitter {
    constructor(options = {}) {
        super();
        
        this.maxConcurrent = Math.min(options.maxConcurrent || 1, 3); // Hard limit of 3
        this.delayBetweenDownloads = (options.delay || 30) * 1000; // Convert to milliseconds
        this.retryAttempts = options.retryAttempts || 3;
        this.retryDelay = options.retryDelay || 5000; // 5 seconds base retry delay
        this.rateLimitBackoff = options.rateLimitBackoff || 60000; // 1 minute for rate limit backoff
        
        this.queue = [];
        this.active = [];
        this.completed = [];
        this.failed = [];
        
        this.isRunning = false;
        this.isPaused = false;
        this.startTime = null;
        
        this.stats = {
            totalQueued: 0,
            completed: 0,
            failed: 0,
            bytesDownloaded: 0,
            averageSpeed: 0
        };
    }

    // Add download task to queue
    addDownload(downloadConfig) {
        const task = {
            id: `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            url: downloadConfig.url,
            channel: downloadConfig.channel,
            outputDirectory: downloadConfig.outputDirectory,
            audioStream: downloadConfig.audioStream || 'eng',
            videoSize: downloadConfig.videoSize || 'best',
            format: downloadConfig.format || 'mp4',
            internationalAudio: downloadConfig.internationalAudio,
            itsoffset: downloadConfig.itsoffset || '-00:00:04.750',
            attempts: 0,
            status: 'queued',
            addedAt: new Date(),
            startedAt: null,
            completedAt: null,
            error: null,
            progress: {
                percent: 0,
                frames: 0,
                fps: 0,
                speed: 0,
                duration: null
            }
        };

        if (!isF1tvUrl(task.url)) {
            throw new Error(`Invalid F1TV URL: ${task.url}`);
        }

        this.queue.push(task);
        this.stats.totalQueued++;
        
        log.info(`📋 Added to queue: ${getContentParams(task.url).name} (Queue position: ${this.queue.length})`);
        this.emit('taskAdded', task);
        
        // Auto-start if not already running
        if (!this.isRunning) {
            this.start();
        }
        
        return task.id;
    }

    // Start processing the queue
    async start() {
        if (this.isRunning) {
            log.warn('⚠️  Download queue is already running');
            return;
        }

        this.isRunning = true;
        this.isPaused = false;
        this.startTime = new Date();
        
        log.info(`🚀 Starting download queue (Max concurrent: ${this.maxConcurrent}, Delay: ${this.delayBetweenDownloads/1000}s)`);
        
        if (this.maxConcurrent > 1) {
            log.warn('⚠️  WARNING: Parallel downloads may violate F1TV Terms of Service and could result in account suspension');
            log.warn('⚠️  Use at your own risk. Consider using --parallel 1 for safety');
        }
        
        this.emit('queueStarted');
        this.processQueue();
    }

    // Stop the queue (finish current downloads)
    async stop() {
        log.info('🛑 Stopping download queue after current downloads complete...');
        this.isRunning = false;
        this.emit('queueStopped');
    }

    // Pause the queue
    pause() {
        log.info('⏸️  Pausing download queue...');
        this.isPaused = true;
        this.emit('queuePaused');
    }

    // Resume the queue
    resume() {
        log.info('▶️  Resuming download queue...');
        this.isPaused = false;
        this.emit('queueResumed');
        this.processQueue();
    }

    // Main queue processing logic
    async processQueue() {
        while (this.isRunning) {
            if (this.isPaused) {
                await this.sleep(1000);
                continue;
            }

            // Check if we can start more downloads
            if (this.active.length < this.maxConcurrent && this.queue.length > 0) {
                const task = this.queue.shift();
                this.active.push(task);
                
                // Process this task (don't await - let it run concurrently)
                this.processTask(task).catch(error => {
                    log.error(`Unhandled error processing task ${task.id}:`, error.message);
                });
                
                // Add delay between starting downloads to avoid overwhelming the server
                if (this.queue.length > 0 && this.maxConcurrent > 1) {
                    await this.sleep(Math.min(this.delayBetweenDownloads / 2, 10000)); // Max 10s delay
                }
            } else if (this.active.length === 0 && this.queue.length === 0) {
                // All done
                break;
            } else {
                // Wait a bit before checking again
                await this.sleep(1000);
            }
        }

        await this.finishQueue();
    }

    // Process individual download task
    async processTask(task) {
        try {
            task.status = 'downloading';
            task.startedAt = new Date();
            task.attempts++;
            
            log.info(`\n⬇️  [${task.attempts}/${this.retryAttempts}] Starting: ${getContentParams(task.url).name}`);
            this.emit('taskStarted', task);

            // Get content info and stream URL
            const content = await getContentInfo(task.url);
            const f1tvUrl = await this.getTokenizedUrl(task.url, content, task.channel);
            
            // Determine output filename
            const ext = task.format === "mp4" ? 'mp4' : 'ts';
            const outFile = (isRace(content) && task.channel !== null) 
                ? `${getContentParams(task.url).name}-${task.channel.split(' ').shift()}.${ext}` 
                : `${getContentParams(task.url).name}.${ext}`;
            const outFileSpec = task.outputDirectory ? path.join(task.outputDirectory, outFile) : outFile;

            // Start the download
            await this.downloadVideo(task, f1tvUrl, content, outFileSpec);
            
            // Success
            task.status = 'completed';
            task.completedAt = new Date();
            this.completed.push(task);
            this.stats.completed++;
            
            log.info(`✅ Completed: ${getContentParams(task.url).name}`);
            this.emit('taskCompleted', task);
            
        } catch (error) {
            await this.handleTaskError(task, error);
        } finally {
            // Remove from active tasks
            const index = this.active.findIndex(t => t.id === task.id);
            if (index > -1) {
                this.active.splice(index, 1);
            }
            
            // Add delay between downloads to be respectful to F1TV servers
            if (this.active.length === 0 && this.queue.length > 0) {
                log.info(`⏳ Waiting ${this.delayBetweenDownloads/1000}s before next download...`);
                await this.sleep(this.delayBetweenDownloads);
            }
        }
    }

    // Handle task errors with retry logic
    async handleTaskError(task, error) {
        task.error = error.message;
        
        // Check for rate limiting
        if (error.response && error.response.status === 429) {
            log.warn(`⚠️  Rate limited! Backing off for ${this.rateLimitBackoff/1000}s...`);
            await this.sleep(this.rateLimitBackoff);
            
            // Retry rate-limited tasks with exponential backoff
            if (task.attempts < this.retryAttempts) {
                log.info(`🔄 Retrying rate-limited task: ${getContentParams(task.url).name}`);
                this.queue.unshift(task); // Add back to front of queue
                return;
            }
        }
        
        // Retry logic for other errors
        if (task.attempts < this.retryAttempts) {
            const retryDelay = this.retryDelay * Math.pow(2, task.attempts - 1); // Exponential backoff
            log.warn(`⚠️  Task failed (attempt ${task.attempts}/${this.retryAttempts}): ${error.message}`);
            log.info(`🔄 Retrying in ${retryDelay/1000}s...`);
            
            await this.sleep(retryDelay);
            this.queue.unshift(task); // Add back to front of queue
            return;
        }
        
        // All retries exhausted
        task.status = 'failed';
        this.failed.push(task);
        this.stats.failed++;
        
        log.error(`❌ Failed after ${task.attempts} attempts: ${getContentParams(task.url).name} - ${error.message}`);
        this.emit('taskFailed', task);
    }

    // Get tokenized stream URL
    async getTokenizedUrl(url, content, channel) {
        let f1tvUrl;
        if (content.metadata.additionalStreams == null) {
            f1tvUrl = await getContentStreamUrl(content.id);
        } else {
            if (isRace(content) && channel == null)
                channel = "F1 LIVE";
            let stream = getAdditionalStreamsInfo(content.metadata.additionalStreams, channel);
            let channelId = (stream.playbackUrl !== null && stream.playbackUrl.indexOf('channelId') == -1) ? null : stream.channelId;
            f1tvUrl = await getContentStreamUrl(content.id, channelId);
        }
        return f1tvUrl;
    }

    // Download video using ffmpeg
    async downloadVideo(task, f1tvUrl, content, outFileSpec) {
        return new Promise(async (resolve, reject) => {
            try {
                const useDash = (f1tvUrl.indexOf('m3u8') == -1);
                const includeInternationalAudio = (task.internationalAudio !== undefined);
                
                if (useDash) log.info('Using DASH.');
                
                const plDetails = await getProgramStreamId(f1tvUrl, task.audioStream, task.videoSize);
                const programStream = plDetails.videoId;
                const audioStreamId = plDetails.audioId;
                
                const videoSelectFormatString = (useDash) ? '0:v:m:id:%i' : '0:p:%i:v';
                const videoSelectString = util.format(videoSelectFormatString, programStream);
                const audioSelectString = (useDash) ? '0:a' : `0:p:${programStream}:a`;
                
                let audioStreamMapping = ['-map', audioSelectString];
                let audioCodecParameters = ['-c:a', 'copy'];
                
                const inputOptions = [
                    '-probesize', '24M',
                    '-analyzeduration', '6M',
                    '-rtbufsize', '2147M'
                ];
                
                let intlInputOptions = [...inputOptions];
                let intlUrl;
                
                if (includeInternationalAudio && isRace(content)) {
                    log.info(`Adding ${task.internationalAudio} commentary from the international feed as a second audio channel.`);
                    
                    intlUrl = await this.getTokenizedUrl(task.url, content, 'INTERNATIONAL');
                    const intlDetails = await getProgramStreamId(intlUrl, task.internationalAudio, '480x270');
                    
                    intlInputOptions.push(...['-itsoffset', task.itsoffset]);
                    
                    const intlVideoSelectFormatString = (useDash) ? '1:v:m:id:%i' : '1:p:%i:v';
                    const intlVideoSelectString = util.format(intlVideoSelectFormatString, intlDetails.videoId);
                    const intlAudioSelectFormatString = (useDash) ? '1:a:m:id:%i' : `1:p:${programStream}:a:%i`;
                    const intlAudioSelectString = util.format(intlAudioSelectFormatString, intlDetails.audioId);
                    
                    audioStreamMapping = [
                        '-map', intlVideoSelectString,
                        '-map', audioSelectString,
                        '-map', intlAudioSelectString,
                    ];
                    
                    let intlLangId = (task.internationalAudio == 'eng') ? 'Sky' : task.internationalAudio;
                    
                    audioCodecParameters = [
                        '-c:a', 'copy',
                        `-metadata:s:a:0`, `language=eng`,
                        `-disposition:a:0`, `default`,
                        `-metadata:s:a:1`, `language=${intlLangId}`,
                        `-disposition:a:1`, `0`
                    ];
                }
                
                log.info('Output file:', config.makeItGreen(outFileSpec));
                
                const options = (task.format == "mp4") ?
                    [
                        '-map', videoSelectString,
                        ...audioStreamMapping,
                        `-c:v`, 'copy',
                        ...audioCodecParameters,
                        '-bsf:a', 'aac_adtstoasc',
                        '-movflags', 'faststart',
                        '-y'
                    ] :
                    [
                        '-map', videoSelectString,
                        ...audioStreamMapping,
                        `-c:v`, 'copy',
                        ...audioCodecParameters,
                        '-y'
                    ];
                
                const ffmpegCommand = (includeInternationalAudio && isRace(content))
                    ? ffmpeg()
                        .input(f1tvUrl)
                        .inputOptions(inputOptions)
                        .input(intlUrl)
                        .inputOptions(intlInputOptions)
                        .outputOptions(options)
                    : ffmpeg()
                        .input(f1tvUrl)
                        .inputOptions(inputOptions)
                        .outputOptions(options);
                
                ffmpegCommand
                    .on('start', commandLine => {
                        log.debug('Executing command:', config.makeItGreen(commandLine));
                    })
                    .on('codecData', data => {
                        task.progress.duration = data.duration;
                        log.info('File duration:', config.makeItGreen(data.duration));
                    })
                    .on('progress', info => {
                        task.progress = {
                            percent: parseInt(info.percent) || 0,
                            frames: info.frames || 0,
                            fps: info.currentFps || 0,
                            speed: info.currentKbps || 0,
                            duration: task.progress.duration
                        };
                        
                        const outStr = `\r[${task.id.slice(-6)}] Frames=${config.makeItGreen(`${info.frames}`.padStart(10))} Fps=${config.makeItGreen(`${info.currentFps}`.padStart(5) + 'fps')} Kbps=${config.makeItGreen(`${info.currentKbps}`.padStart(7) + 'Kbps')} Duration=${config.makeItGreen(`${info.timemark}`)} Percent=${config.makeItGreen(`${parseInt(info.percent)}`.padStart(3) + '%')}`;
                        process.stdout.write(outStr);
                        
                        this.emit('taskProgress', task);
                    })
                    .on('end', () => {
                        log.info(`\n✅ Download complete: ${getContentParams(task.url).name}`);
                        resolve();
                    })
                    .on('error', error => {
                        log.error(`❌ FFmpeg error: ${error.message}`);
                        reject(error);
                    })
                    .save(outFileSpec);
                    
            } catch (error) {
                reject(error);
            }
        });
    }

    // Finish queue processing
    async finishQueue() {
        this.isRunning = false;
        const endTime = new Date();
        const duration = Math.round((endTime - this.startTime) / 1000);
        
        log.info('\n' + '='.repeat(60));
        log.info('📊 DOWNLOAD QUEUE SUMMARY');
        log.info('='.repeat(60));
        log.info(`⏱️  Total Time: ${Math.floor(duration / 60)}m ${duration % 60}s`);
        log.info(`✅ Completed: ${this.stats.completed}/${this.stats.totalQueued}`);
        log.info(`❌ Failed: ${this.stats.failed}/${this.stats.totalQueued}`);
        log.info(`⏸️  Remaining: ${this.queue.length}`);
        
        if (this.failed.length > 0) {
            log.info('\n❌ FAILED DOWNLOADS:');
            this.failed.forEach(task => {
                log.info(`  - ${getContentParams(task.url).name}: ${task.error}`);
            });
        }
        
        log.info('='.repeat(60));
        
        this.emit('queueCompleted', {
            duration,
            completed: this.stats.completed,
            failed: this.stats.failed,
            total: this.stats.totalQueued
        });
    }

    // Get queue status
    getStatus() {
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            queueLength: this.queue.length,
            activeDownloads: this.active.length,
            completedDownloads: this.completed.length,
            failedDownloads: this.failed.length,
            stats: this.stats,
            maxConcurrent: this.maxConcurrent,
            delayBetweenDownloads: this.delayBetweenDownloads
        };
    }

    // Utility function for delays
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Clear completed/failed tasks
    clearHistory() {
        this.completed = [];
        this.failed = [];
        log.info('🗑️  Cleared completed and failed task history');
    }
}

module.exports = { DownloadQueue };