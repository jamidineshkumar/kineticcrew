package com.kineticcrew.hq;

import android.Manifest;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

@CapacitorPlugin(
    name = "KcVoice",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class KcVoicePlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private SpeechRecognizer recognizer;
    private boolean listening = false;
    private boolean starting = false;
    private String language = "en-IN";

    @PluginMethod
    public void startListening(PluginCall call) {
        language = call.getString("language", "en-IN");
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("Android speech recognition is unavailable on this device.");
            return;
        }
        if (getPermissionState("microphone") != com.getcapacitor.PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
            return;
        }
        listening = true;
        beginRecognition();
        JSObject result = new JSObject();
        result.put("started", true);
        call.resolve(result);
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == com.getcapacitor.PermissionState.GRANTED) {
            listening = true;
            beginRecognition();
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } else {
            call.reject("Microphone permission is required for KC Voice.");
        }
    }

    @PluginMethod
    public void stopListening(PluginCall call) {
        listening = false;
        handler.removeCallbacksAndMessages(null);
        destroyRecognizer();
        call.resolve();
    }

    private void beginRecognition() {
        if (!listening || starting) return;
        starting = true;
        handler.post(() -> {
            if (!listening) { starting = false; return; }
            try {
                destroyRecognizer();
                recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle params) {
                        starting = false;
                        JSObject event = new JSObject(); event.put("state", "listening");
                        notifyListeners("recognitionState", event);
                    }
                    @Override public void onBeginningOfSpeech() {}
                    @Override public void onRmsChanged(float rmsdB) {}
                    @Override public void onBufferReceived(byte[] buffer) {}
                    @Override public void onEndOfSpeech() {}
                    @Override public void onError(int error) {
                        starting = false;
                        JSObject event = new JSObject();
                        event.put("code", error);
                        event.put("message", errorMessage(error));
                        notifyListeners("recognitionError", event);
                        if (listening && error != SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS) {
                            handler.postDelayed(() -> beginRecognition(), retryDelay(error));
                        }
                    }
                    @Override public void onResults(Bundle results) {
                        starting = false;
                        emitResult(results);
                        if (listening) handler.postDelayed(() -> beginRecognition(), 250);
                    }
                    @Override public void onPartialResults(Bundle partialResults) {}
                    @Override public void onEvent(int eventType, Bundle params) {}
                });
                Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language);
                intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language);
                intent.putExtra(RecognizerIntent.EXTRA_ONLY_RETURN_LANGUAGE_PREFERENCE, false);
                intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
                intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());
                recognizer.startListening(intent);
            } catch (Exception error) {
                starting = false;
                JSObject event = new JSObject();
                event.put("message", error.getMessage() == null ? "Could not start Android speech recognition." : error.getMessage());
                notifyListeners("recognitionError", event);
                if (listening) handler.postDelayed(() -> beginRecognition(), 1200);
            }
        });
    }

    private void emitResult(Bundle results) {
        ArrayList<String> matches = results == null ? null : results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) return;
        JSObject event = new JSObject();
        event.put("text", matches.get(0));
        event.put("language", language);
        notifyListeners("transcript", event);
    }

    private long retryDelay(int error) {
        if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) return 1000;
        if (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT) return 300;
        return 700;
    }

    private String errorMessage(int error) {
        switch (error) {
            case SpeechRecognizer.ERROR_AUDIO: return "Audio recording error";
            case SpeechRecognizer.ERROR_CLIENT: return "Speech recognizer client error";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "Microphone permission denied";
            case SpeechRecognizer.ERROR_NETWORK: return "Speech recognition network error";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "Speech recognition network timeout";
            case SpeechRecognizer.ERROR_NO_MATCH: return "No speech match";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "Speech recognizer busy";
            case SpeechRecognizer.ERROR_SERVER: return "Speech recognition server error";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "No speech detected";
            default: return "Speech recognition error " + error;
        }
    }

    private void destroyRecognizer() {
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        // Android speech recognition is deliberately foreground-only.
        listening = false;
        handler.removeCallbacksAndMessages(null);
        destroyRecognizer();
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        // The web layer restarts recognition after the app returns to foreground.
    }

    @Override
    protected void handleOnDestroy() {
        listening = false;
        handler.removeCallbacksAndMessages(null);
        destroyRecognizer();
        super.handleOnDestroy();
    }
}