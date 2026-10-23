"""Synthesise many short lines with Kokoro in one process (the model loads once).

stdin: JSON [{"id": "03", "text": "...", "voice": "af_sarah", "speed": 1.0}]
argv[1]: output directory. Writes <id>.wav (24 kHz mono PCM16) and prints JSON {id: seconds}.
"""
import json, sys
from pathlib import Path
import numpy as np
import soundfile as sf

SR = 24000

def main():
    out = Path(sys.argv[1]); out.mkdir(parents=True, exist_ok=True)
    items = json.load(sys.stdin)
    from kokoro import KPipeline
    pipes = {}
    durs = {}
    for it in items:
        lang = it["voice"][0]
        if lang not in pipes:
            pipes[lang] = KPipeline(lang_code=lang, repo_id="hexgrad/Kokoro-82M")
        chunks = [np.asarray(a, dtype=np.float32) for _, _, a in pipes[lang](it["text"], voice=it["voice"], speed=float(it.get("speed", 1.0))) if a is not None]
        audio = np.concatenate(chunks) if chunks else np.zeros(int(SR * 0.3), dtype=np.float32)
        sf.write(out / f"{it['id']}.wav", audio, SR, subtype="PCM_16")
        durs[it["id"]] = round(len(audio) / SR, 3)
    print(json.dumps(durs))

if __name__ == "__main__":
    main()
