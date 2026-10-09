// Original synthesised engine and effects; no remote assets.
export class RaceAudio {
  constructor(){this.muted=false;this.context=null;}
  async unlock(){try {
    if(!this.context){const C=window.AudioContext||window.webkitAudioContext;if(!C)return;this.context=new C();
      this.master=this.context.createGain();this.master.gain.value=this.muted?0:.16;this.master.connect(this.context.destination);
      this.engine=this.context.createOscillator();this.engine.type='sawtooth';this.engineGain=this.context.createGain();this.engineGain.gain.value=0;
      const filter=this.context.createBiquadFilter();filter.type='lowpass';filter.frequency.value=440;
      this.engine.connect(filter).connect(this.engineGain).connect(this.master);this.engine.start();}
    await this.context.resume();
  }catch{ /* Audio support is optional. */ }}
  toggle(){this.muted=!this.muted;if(this.master)this.master.gain.setTargetAtTime(this.muted?0:.16,this.context.currentTime,.03);return this.muted;}
  tone(frequency,duration=.12,type='sine',volume=.5,end=frequency){
    if(!this.context||this.context.state!=='running')return;
    const c=this.context,o=c.createOscillator(),g=c.createGain(),t=c.currentTime;
    o.type=type;o.frequency.setValueAtTime(frequency,t);o.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);
    g.gain.setValueAtTime(volume,t);g.gain.exponentialRampToValueAtTime(.001,t+duration);
    o.connect(g).connect(this.master);o.start(t);o.stop(t+duration+.02);o.onended=()=>{o.disconnect();g.disconnect();};
  }
  event(e){
    if(e.id!==undefined&&e.id!==0)return;
    if(e.type==='countdown'&&e.value>0)this.tone(480,.12);
    if(e.type==='go')this.tone(960,.4,'triangle');
    if(e.type==='boost')this.tone(160,.65,'sawtooth',.2,620);
    if(e.type==='drift-release')this.tone(720,.25,'sine',.35,1100);
    if(e.type==='hit')this.tone(90,.16,'triangle',.8,30);
    if(e.type==='item-pickup')this.tone(550,.22,'triangle',.45,1200);
    if(e.type==='item-use')this.tone(e.item==='missile'?180:540,.28,'triangle',.45,e.item==='missile'?900:780);
    if(e.type==='item-hit')this.tone(150,.32,'sawtooth',.35,35);
    if(e.type==='item-block')this.tone(1100,.28,'sine',.5,450);
    if(e.type==='skill-use'){const pitch=({overdrive:220,catwalk:680,emp:140,guardian:880,magnet:520})[e.skill]||440;this.tone(pitch,.42,'triangle',.45,pitch*1.8);}
    if(e.type==='skill-hit')this.tone(120,.22,'sawtooth',.3,55);
    if(e.type==='skill-block')this.tone(1000,.2,'sine',.4,1400);
    if(e.type==='lap')this.tone(850,.4,'triangle',.5,1300);
    if(e.type==='finish'){this.tone(660,.7,'triangle');setTimeout(()=>this.tone(990,.9,'triangle'),180);}
  }
  update(speed,active,drifting){if(!this.context)return;const t=this.context.currentTime;
    this.engine.frequency.setTargetAtTime(45+Math.abs(speed)*4+(drifting?22:0),t,.08);
    this.engineGain.gain.setTargetAtTime(active?.1+Math.min(Math.abs(speed)/250,.17):0,t,.1);
  }
}
