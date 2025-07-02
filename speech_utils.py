import azure.cognitiveservices.speech as speechsdk

class SpeechUtil:
    def __init__(self, api_key, region):
        self.api_key = api_key
        self.region = region
        if not api_key or not region:
            print("Warning: Azure Speech API key or region not configured. Speech functionalities will not work.")

    def speech_to_text(self):
        if not self.api_key or not self.region:
            return "Speech services not configured."

        speech_config = speechsdk.SpeechConfig(subscription=self.api_key, region=self.region)
        speech_config.speech_recognition_language = "en-US"
        audio_config = speechsdk.AudioConfig(use_default_microphone=True)
        speech_recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

        speech_recognizer.properties.set_property(speechsdk.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs, "60000")
        speech_recognizer.properties.set_property(speechsdk.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "50000")

        print("Listening...")
        result = speech_recognizer.recognize_once_async().get()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            return result.text
        elif result.reason == speechsdk.ResultReason.NoMatch:
            return "No speech could be recognized"
        elif result.reason == speechsdk.ResultReason.Canceled:
            return f"Speech Recognition canceled: {result.cancellation_details.reason}"
        return "Speech recognition failed for an unknown reason."

    def text_to_speech(self, text):
        if not self.api_key or not self.region:
            print("Speech services not configured. Cannot synthesize text.")
            return False
            
        speech_config = speechsdk.SpeechConfig(subscription=self.api_key, region=self.region)
        speech_config.speech_synthesis_voice_name = "en-US-NovaTurboMultilingualNeural"
        try:
            audio_config = speechsdk.audio.AudioOutputConfig(use_default_speaker=True)
            speech_synthesizer = speechsdk.SpeechSynthesizer(
                speech_config=speech_config,
                audio_config=audio_config
            )
            result = speech_synthesizer.speak_text_async(text).get()
            if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
                return True
            else:
                print(f"Error synthesizing audio: {result.reason}")
                return False
        except Exception as e:
            print(f"Error in text-to-speech conversion: {str(e)}")
            return False