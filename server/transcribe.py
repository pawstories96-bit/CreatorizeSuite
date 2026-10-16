import json, sys, subprocess, os
import numpy as np
import ctranslate2
from faster_whisper import WhisperModel
audio, output, model_name, language = sys.argv[1:5]
requested_device = sys.argv[5] if len(sys.argv) > 5 else 'auto'
device = ('cuda' if ctranslate2.get_cuda_device_count() > 0 else 'cpu') if requested_device == 'auto' else requested_device
if device not in ('cpu', 'cuda'): raise ValueError('Choose auto, cpu or cuda for transcription')
if model_name == 'auto': model_name = 'small' if device == 'cuda' else 'base'
try:
    model = WhisperModel(model_name, device=device, compute_type='float16' if device == 'cuda' else 'int8')
except RuntimeError:
    if device != 'cuda': raise
    device = 'cpu'
    model = WhisperModel(model_name, device='cpu', compute_type='int8')
# Decode with the same FFmpeg runtime used by the desktop renderer. Passing
# samples also avoids coupling transcription to PyAV's changing open() API.
decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', audio, '-f', 's16le',
                          '-ac', '1', '-ar', '16000', 'pipe:1'],
                         check=True, capture_output=True)
samples = np.frombuffer(decoded.stdout, dtype=np.int16).astype(np.float32) / 32768.0
def recognize(active_model):
    segments, info = active_model.transcribe(samples, language=None if language=='auto' else language.split('-')[0], word_timestamps=True, vad_filter=True, condition_on_previous_text=False)
    return list(segments), info
try:
    segments, info = recognize(model)
except RuntimeError:
    if device != 'cuda': raise
    device = 'cpu'
    del model
    model = WhisperModel(model_name, device='cpu', compute_type='int8')
    segments, info = recognize(model)
words = [{'w':w.word.strip(), 'start':w.start, 'end':w.end} for s in segments for w in (s.words or []) if w.word.strip() and w.end>w.start]
with open(output,'w',encoding='utf-8') as f: json.dump(words,f,ensure_ascii=False,indent=2)
with open(os.path.splitext(output)[0]+'.phrases.json','w',encoding='utf-8') as f: json.dump([{'text':s.text.strip(),'start':s.start,'end':s.end} for s in segments],f,ensure_ascii=False,indent=2)
print(json.dumps({'words':len(words),'language':info.language,'device':device,'model':model_name}))
