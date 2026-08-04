package com.khoaluan.indoornav.fcm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.AudioTrack
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log
import kotlin.math.PI
import kotlin.math.sin
import kotlin.math.tanh

/**
 * Còi hú cảnh báo khẩn cấp — STREAM_ALARM, khóa volume khi đang phát.
 */
object EmergencySirenPlayer {
    private const val TAG = "EmergencySiren"
    private const val SAMPLE_RATE = 22_050
    /** Biên độ vừa phải — đủ nghe rõ, tránh đẩy loa sát clip (dễ ù / hại loa). */
    private const val AMP = 0.62
    /** Khóa volume ALARM ~95% max. */
    private const val ALARM_VOLUME_RATIO = 0.95f

    private val lock = Any()
    private val mainHandler = Handler(Looper.getMainLooper())

    @Volatile
    private var playing = false
    private var worker: Thread? = null
    private var audioTrack: AudioTrack? = null
    private var focusRequest: AudioFocusRequest? = null
    private var audioManager: AudioManager? = null
    private var appContext: Context? = null
    private var vibrator: Vibrator? = null
    private var savedAlarmVolume: Int = -1
    private var volumeLockReceiver: BroadcastReceiver? = null
    private var volumeGuardRunnable: Runnable? = null

    /** True khi còi đang phát trong process hiện tại. */
    val isPlaying: Boolean
        get() = playing

    fun start(context: Context) {
        synchronized(lock) {
            if (playing) return
            val appCtx = context.applicationContext
            appContext = appCtx
            playing = true
            requestFocus(appCtx)
            forceMaxAlarmVolume(appCtx)
            registerVolumeLock(appCtx)
            startVolumeGuard(appCtx)
            startVibrate(appCtx)

            worker = Thread({
                var track: AudioTrack? = null
                try {
                    val minBuf = AudioTrack.getMinBufferSize(
                        SAMPLE_RATE,
                        android.media.AudioFormat.CHANNEL_OUT_MONO,
                        android.media.AudioFormat.ENCODING_PCM_16BIT,
                    ).coerceAtLeast(2048)

                    val attrs = AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()

                    track = AudioTrack.Builder()
                        .setAudioAttributes(attrs)
                        .setAudioFormat(
                            android.media.AudioFormat.Builder()
                                .setSampleRate(SAMPLE_RATE)
                                .setEncoding(android.media.AudioFormat.ENCODING_PCM_16BIT)
                                .setChannelMask(android.media.AudioFormat.CHANNEL_OUT_MONO)
                                .build()
                        )
                        .setBufferSizeInBytes(minBuf * 2)
                        .setTransferMode(AudioTrack.MODE_STREAM)
                        .build()

                    // Gain track đầy; mức nghe do STREAM_ALARM (~95%)
                    runCatching { track.setVolume(1f) }

                    synchronized(lock) { audioTrack = track }
                    track.play()

                    val buf = ShortArray(1024)
                    var phase = 0.0
                    var sampleIndex = 0L

                    while (playing && !Thread.currentThread().isInterrupted) {
                        for (i in buf.indices) {
                            val t = sampleIndex / SAMPLE_RATE.toDouble()
                            // Quét nhanh hơn + biên độ rộng hơn → cảm giác “to / gắt”
                            val sweep = 0.5 + 0.5 * sin(2.0 * PI * t / 0.85)
                            val freq = 480.0 + 900.0 * sweep
                            phase += 2.0 * PI * freq / SAMPLE_RATE
                            if (phase > 2.0 * PI) phase -= 2.0 * PI
                            // Chủ yếu sine + harmonic nhẹ — đỡ gắt, đỡ hại loa
                            val sine = sin(phase)
                            val mixed = sine * 0.80 + sin(phase * 2.0) * 0.15 + sin(phase * 3.0) * 0.05
                            val boosted = tanh(mixed * 1.15)
                            buf[i] = (boosted * Short.MAX_VALUE * AMP).toInt()
                                .coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt())
                                .toShort()
                            sampleIndex++
                        }
                        val written = track.write(buf, 0, buf.size)
                        if (written < 0) break
                    }
                } catch (e: Exception) {
                    Log.w(TAG, "siren: ${e.message}")
                } finally {
                    releaseTrack(track)
                    synchronized(lock) {
                        if (audioTrack === track) audioTrack = null
                        playing = false
                    }
                }
            }, "emergency-siren").also {
                it.isDaemon = true
                it.start()
            }

            Log.i(TAG, "Siren started (alarm volume lock ${ALARM_VOLUME_RATIO})")
        }
    }

    fun stop() {
        synchronized(lock) {
            playing = false
            val track = audioTrack
            audioTrack = null
            val thr = worker
            worker = null
            releaseTrack(track)
            thr?.interrupt()
            stopVolumeGuard()
            unregisterVolumeLock()
            restoreAlarmVolume()
            stopVibrate()
            abandonFocus()
            appContext = null
            Log.i(TAG, "Siren stopped")
        }
        runCatching { Thread.sleep(50) }
    }

    private fun forceMaxAlarmVolume(context: Context) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        audioManager = am
        runCatching {
            val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
            // Tránh làm tròn về 0 trên thang volume thấp — giữ tối thiểu 1 nếu max > 0
            val target = (max * ALARM_VOLUME_RATIO).toInt().coerceIn(0, max).let {
                if (it == 0 && max > 0) 1 else it
            }
            if (savedAlarmVolume < 0) {
                savedAlarmVolume = am.getStreamVolume(AudioManager.STREAM_ALARM)
            }
            val cur = am.getStreamVolume(AudioManager.STREAM_ALARM)
            if (cur != target) {
                am.setStreamVolume(AudioManager.STREAM_ALARM, target, 0)
            }
            Log.i(TAG, "Alarm volume locked to $target/$max (was $savedAlarmVolume)")
        }
    }

    private fun restoreAlarmVolume() {
        val am = audioManager ?: return
        val prev = savedAlarmVolume
        savedAlarmVolume = -1
        if (prev >= 0) {
            runCatching {
                am.setStreamVolume(AudioManager.STREAM_ALARM, prev, 0)
                Log.i(TAG, "Alarm volume restored to $prev")
            }
        }
    }

    private fun registerVolumeLock(context: Context) {
        unregisterVolumeLock()
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (!playing) return
                // User vặn volume → ép lại mức khóa (~95%)
                forceMaxAlarmVolume(context)
            }
        }
        volumeLockReceiver = receiver
        val filter = IntentFilter("android.media.VOLUME_CHANGED_ACTION")
        if (Build.VERSION.SDK_INT >= 33) {
            context.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            context.registerReceiver(receiver, filter)
        }
    }

    private fun unregisterVolumeLock() {
        val ctx = appContext ?: return
        val receiver = volumeLockReceiver ?: return
        volumeLockReceiver = null
        runCatching { ctx.unregisterReceiver(receiver) }
    }

    /** Poll mỗi 400ms — OEM đôi khi không gửi VOLUME_CHANGED. */
    private fun startVolumeGuard(context: Context) {
        stopVolumeGuard()
        val runnable = object : Runnable {
            override fun run() {
                if (!playing) return
                forceMaxAlarmVolume(context)
                mainHandler.postDelayed(this, 400L)
            }
        }
        volumeGuardRunnable = runnable
        mainHandler.post(runnable)
    }

    private fun stopVolumeGuard() {
        volumeGuardRunnable?.let { mainHandler.removeCallbacks(it) }
        volumeGuardRunnable = null
    }

    private fun releaseTrack(track: AudioTrack?) {
        if (track == null) return
        runCatching {
            track.pause()
            track.flush()
            track.stop()
            track.release()
        }
    }

    private fun requestFocus(context: Context) {
        val am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        audioManager = am
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setOnAudioFocusChangeListener { }
                .build()
            focusRequest = req
            am.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            am.requestAudioFocus(null, AudioManager.STREAM_ALARM, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        }
    }

    private fun abandonFocus() {
        val am = audioManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest?.let { am.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            am.abandonAudioFocus(null)
        }
        focusRequest = null
    }

    private fun startVibrate(context: Context) {
        stopVibrate()
        val vib = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = context.getSystemService(VibratorManager::class.java)
            vm?.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
        } ?: return
        vibrator = vib
        val pattern = longArrayOf(0, 700, 180, 700, 180, 1000)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            vib.vibrate(VibrationEffect.createWaveform(pattern, 0))
        } else {
            @Suppress("DEPRECATION")
            vib.vibrate(pattern, 0)
        }
    }

    private fun stopVibrate() {
        runCatching { vibrator?.cancel() }
        vibrator = null
    }
}
