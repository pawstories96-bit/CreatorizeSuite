import json, sys, subprocess
import numpy as np
from faster_whisper import WhisperModel
audio, output, model_name, language = sys.argv[1:5]
model = WhisperModel(model_name, device='cpu', compute_type='int8')
# Decode with the same FFmpeg runtime used by the desktop renderer. Passing
# samples also avoids coupling transcription to PyAV's changing open() API.
decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', audio, '-f', 's16le',
                          '-ac', '1', '-ar', '16000', 'pipe:1'],
                         check=True, capture_output=True)
samples = np.frombuffer(decoded.stdout, dtype=np.int16).astype(np.float32) / 32768.0
segments, info = model.transcribe(samples, language=None if language=='auto' else language, word_timestamps=True, vad_filter=True)
words = [{'w':w.word.strip(), 'start':w.start, 'end':w.end} for s in segments for w in (s.words or []) if w.word.strip() and w.end>w.start]
with open(output,'w',encoding='utf-8') as f: json.dump(words,f,ensure_ascii=False,indent=2)
print(json.dumps({'words':len(words),'language':info.language}))
