import {useEffect,useRef,useState,type RefObject} from 'react';

export function CinemaScopes({source}:{source:RefObject<HTMLCanvasElement>}){
  const [open,setOpen]=useState(false);
  const wave=useRef<HTMLCanvasElement>(null);
  const vector=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    if(!open)return;
    const sample=document.createElement('canvas');
    sample.width=96;
    sample.height=54;
    const read=sample.getContext('2d',{willReadFrequently:true})!;
    const waveContext=wave.current?.getContext('2d');
    const vectorContext=vector.current?.getContext('2d');
    if(!waveContext||!vectorContext)return;
    const draw=()=>{
      const frame=source.current;
      if(!frame?.width||!frame.height)return;
      read.drawImage(frame,0,0,sample.width,sample.height);
      const {data}=read.getImageData(0,0,sample.width,sample.height);
      const {width,height}=waveContext.canvas;
      for(const ctx of [waveContext,vectorContext]){
        ctx.fillStyle='#10151c';
        ctx.fillRect(0,0,width,height);
        ctx.strokeStyle='#41515c';
        ctx.beginPath();
      }
      for(const level of [0,.25,.5,.75,1]){
        const y=.5+(height-1)*level;
        waveContext.moveTo(0,y);
        waveContext.lineTo(width,y);
      }
      waveContext.stroke();
      const radius=height*.46;
      vectorContext.arc(width/2,height/2,radius,0,Math.PI*2);
      vectorContext.moveTo(width/2-radius,height/2);
      vectorContext.lineTo(width/2+radius,height/2);
      vectorContext.moveTo(width/2,height/2-radius);
      vectorContext.lineTo(width/2,height/2+radius);
      vectorContext.stroke();
      waveContext.fillStyle='#78f0be29';
      vectorContext.fillStyle='#a5d8ff24';
      for(let i=0;i<data.length;i+=4){
        const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255;
        const luma=.2126*r+.7152*g+.0722*b;
        const cb=(b-luma)/1.8556;
        const cr=(r-luma)/1.5748;
        waveContext.fillRect((i/4%sample.width)/sample.width*width,(1-luma)*(height-1),2,2);
        vectorContext.fillRect(width/2+2*radius*cb,height/2-2*radius*cr,2,2);
      }
    };
    draw();
    const timer=window.setInterval(draw,100);
    return ()=>window.clearInterval(timer);
  },[open,source]);
  return <details className="cinema-scopes" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary>Escopios del visor</summary>
    <figure><figcaption>Forma de onda · luminosidad</figcaption>
      <canvas ref={wave} width={272} height={136} aria-label="Forma de onda de luminosidad"/></figure>
    <figure><figcaption>Vectorscopio · color</figcaption>
      <canvas ref={vector} width={272} height={136} aria-label="Vectorscopio de crominancia"/></figure>
  </details>;
}
