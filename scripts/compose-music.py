"""River Oath: original looping pentatonic game music, composed in code.
No sampled or third-party recording. Rebuild with Python + numpy + ffmpeg.
"""
import math, subprocess, wave
from pathlib import Path
import numpy as np

RATE=32000
BEAT=2/3  # 90 BPM, 24 bars, 64-second seamless loop
DURATION=64
mix=np.zeros((RATE*DURATION,2),dtype=np.float64)
rng=np.random.default_rng(911)
def hz(midi): return 440*2**((midi-69)/12)
def add(note,start,duration,volume=.15,voice='pluck',pan=0):
    t=np.arange(int(duration*RATE))/RATE; f=hz(note)
    if voice=='flute':
        phase=2*np.pi*f*t+.018*np.sin(2*np.pi*4.5*t)
        signal=(np.sin(phase)+.12*np.sin(2*phase)+.025*np.sin(3*phase))*np.minimum(1,t/.15)*np.minimum(1,(duration-t)/.25)
    elif voice=='pad':
        signal=(np.sin(2*np.pi*f*t)+.28*np.sin(2*np.pi*f*1.002*t))*np.sin(np.pi*t/duration)**1.5
    elif voice=='drum':
        signal=np.sin(2*np.pi*(56*t+2*(1-np.exp(-t*24))))*np.exp(-t*16)+rng.normal(0,.12,len(t))*np.exp(-t*35)
    else:
        signal=(np.sin(2*np.pi*f*t)+.38*np.sin(2*np.pi*2*f*t)+.15*np.sin(2*np.pi*3*f*t))*np.exp(-t*3.2)*np.minimum(1,t/.008)
    signal*=volume
    for delay,wet in [(0,1),(.19,.13),(.37,.09),(.61,.06)]:
        indices=(np.arange(len(t))+round((start+delay)*RATE))%len(mix)
        mix[indices,0]+=signal*wet*math.sqrt((1-pan)/2)
        mix[indices,1]+=signal*wet*math.sqrt((1+pan)/2)

chords=[[48,55,60,64],[45,52,57,64],[41,48,53,60],[43,50,55,62]]
melody=[[76,79,81,79,76,74,72,74],[76,74,72,69,72,74,76,79],[81,79,76,74,72,74,76,72],[74,76,79,76,74,72,69,72],
        [72,76,79,84,81,79,76,74],[76,79,81,79,76,72,74,76]]
for bar in range(24):
    base=bar*4*BEAT; chord=chords[(bar//2)%4]
    for k,note in enumerate(chord): add(note,base+k*BEAT/2,2.4,.10,'pluck',-.35 if k%2 else .35)
    add(chord[0]-12,base,4*BEAT,.09,'pad')
    for beat in [0,2]: add(30,base+beat*BEAT,.45,.075,'drum',-.1)
    if bar%4!=3:
        phrase=melody[(bar//2)%len(melody)]
        for k in range(4): add(phrase[(bar%2)*4+k],base+k*BEAT,BEAT*.88,.065,'flute',.16)
    if bar%4==3:
        for k,note in enumerate([79,76,74,72]): add(note,base+(2+k/2)*BEAT,1.8,.10,'pluck',-.2)

mix=np.tanh(mix*1.2)
mix*=.8/max(1,np.max(np.abs(mix)))
out=Path('artifacts/river-oath.wav');out.parent.mkdir(exist_ok=True)
with wave.open(str(out),'wb') as f:
    f.setnchannels(2);f.setsampwidth(2);f.setframerate(RATE);f.writeframes((mix*32767).astype('<i2').tobytes())
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','error','-i',str(out),'-codec:a','libmp3lame','-b:a','64k','public/assets/river-oath.mp3'],check=True)
print('Composed River Oath: 64 seconds, original stereo instrumental, peak',float(np.max(np.abs(mix))))
