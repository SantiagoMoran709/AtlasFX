import {useEffect,useRef,useState} from 'react';
import {SECOND,type Clip} from '@corte/core';

export type Graphic = 'rect'|'circle'|'line'|'arrow'|'solid'|'gradient'|'star'|'heart';
export type Placement = 'overlay'|'background'|'recording';

export function makeGraphic(kind: Graphic, color: string, secondColor: string, width: number, height: number) {
  const canvas = document.createElement('canvas');
  const background = kind === 'solid' || kind === 'gradient';
  canvas.width = background ? width : 512;
  canvas.height = background ? height : 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 30;
  ctx.lineCap = 'round';
  if (kind === 'gradient') {
    const gradient = ctx.createLinearGradient(0,0,width,height);
    gradient.addColorStop(0,color);
    gradient.addColorStop(1,secondColor);
    ctx.fillStyle = gradient;
  }
  if (background) ctx.fillRect(0,0,width,height);
  else {
    ctx.beginPath();
    switch (kind) {
      case 'rect': ctx.roundRect(32,108,448,296,38); break;
      case 'circle': ctx.arc(256,256,224,0,2*Math.PI); break;
      case 'line': ctx.moveTo(54,256);ctx.lineTo(458,256);ctx.stroke();break;
      case 'arrow':
        ctx.moveTo(60,222);ctx.lineTo(304,222);ctx.lineTo(304,143);
        ctx.lineTo(466,256);ctx.lineTo(304,369);ctx.lineTo(304,290);ctx.lineTo(60,290);
        break;
      case 'star':
        for(let i=0;i<10;i++){
          const angle=i*Math.PI/5-Math.PI/2;
          const radius=i%2===0?226:100;
          ctx.lineTo(256+Math.cos(angle)*radius,256+Math.sin(angle)*radius);
        }
        break;
      case 'heart':
        ctx.moveTo(256,445);
        ctx.bezierCurveTo(200,388,35,298,35,178);
        ctx.bezierCurveTo(35,55,199,53,256,158);
        ctx.bezierCurveTo(313,53,477,55,477,178);
        ctx.bezierCurveTo(477,298,312,388,256,445);
        break;
    }
    ctx.closePath();
    ctx.fill();
  }
  const encoded=canvas.toDataURL('image/png').split(',')[1];
  if(!encoded)throw new Error('No se pudo crear la imagen.');
  const bytes=Uint8Array.from(atob(encoded),byte=>byte.charCodeAt(0));
  return new File([bytes],`${graphics[kind]}.png`,{type:'image/png'});
}

const graphics: Record<Graphic,string> = {
  rect:'Rectángulo',circle:'Círculo',line:'Línea',arrow:'Flecha',
  solid:'Fondo sólido',gradient:'Fondo degradado',star:'Estrella',heart:'Corazón',
};
const positions = [[24,24],[76,24],[24,76],[76,76]] as const;
const corners = ['Superior izquierda','Superior derecha','Inferior izquierda','Inferior derecha'];

export const CONTENT_SECTIONS = {"text":"Texto y títulos","layers":"Capas visuales","brand":"Marca y títulos","motion":"Movimiento","capture":"Captura","format":"Formato"} as const;
export type ContentSection = keyof typeof CONTENT_SECTIONS;

export function ContentTools({section,clip, watermarkAssets, updateClip, insertGraphic, insertWatermark, insertLowerThird, snapshot, insertRecording, message}: {
  section: ContentSection;
  clip?: Clip;
  watermarkAssets: {id:string; name:string}[];
  updateClip: (props:Partial<Clip>)=>void;
  insertGraphic: (kind:Graphic,color:string,secondColor:string)=>void;
  insertWatermark: (assetId:string,corner:number)=>void;
  insertLowerThird: (name:string,role:string)=>void;
  snapshot: ()=>void;
  insertRecording: (file:File)=>void;
  message: (text:string)=>void;
}) {
  const [graphic,setGraphic]=useState<Graphic>('rect');
  const [color,setColor]=useState('#66ddc5');
  const [secondColor,setSecondColor]=useState('#17283e');
  const [corner,setCorner]=useState(1);
  const [logo,setLogo]=useState('');
  const [name,setName]=useState('');
  const [role,setRole]=useState('');
  const [motion,setMotion]=useState('both');
  const [motionDuration,setMotionDuration]=useState(.5);
  const [capture,setCapture]=useState<'idle'|'starting'|'recording'|'stopping'>('idle');
  const preview=useRef<HTMLVideoElement>(null);
  const recorder=useRef<MediaRecorder>();
  const mounted=useRef(false);
  const stream=useRef<MediaStream>();

  useEffect(()=>{
    mounted.current=true;
    return ()=>{
      mounted.current=false;
      if(recorder.current?.state==='recording')recorder.current.stop();
      stream.current?.getTracks().forEach(track=>track.stop());
    };
  },[]);

  useEffect(()=>{
    if(preview.current)preview.current.srcObject=stream.current??null;
  },[capture]);

  async function record(source:'screen'|'camera'){
    setCapture('starting');
    let acquired:MediaStream|undefined;
    try {
      acquired=source==='screen'
        ? await navigator.mediaDevices.getDisplayMedia({video:true,audio:false})
        : await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      if(!mounted.current){acquired.getTracks().forEach(track=>track.stop());return;}
      const active=acquired;
      const mimeType=['video/mp4;codecs=avc1.424028','video/webm;codecs=vp8']
        .find(type=>MediaRecorder.isTypeSupported(type));
      const writer=new MediaRecorder(active,mimeType?{mimeType}:undefined);
      const chunks:Blob[]=[];
      let failed=false;
      stream.current=active;
      recorder.current=writer;
      writer.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
      writer.onerror=()=>{failed=true;if(mounted.current)message('La grabación se interrumpió.');};
      writer.onstop=async ()=>{
        active.getTracks().forEach(track=>track.stop());
        stream.current=undefined;
        recorder.current=undefined;
        if(!mounted.current)return;
        setCapture('idle');
        if(failed)return;
        if(!chunks.length){message('La grabación quedó vacía. Probá grabar durante unos segundos.');return;}
        try{
          const type=writer.mimeType||chunks[0].type;
          const extension=type.startsWith('video/mp4')?'mp4':'webm';
          const label=source==='screen'?'Pantalla':'Cámara';
          const data=await new Blob(chunks,{type}).arrayBuffer();
          if(mounted.current)insertRecording(new File([data],`${label}-${Date.now()}.${extension}`,{type}));
        }catch(error){
          if(mounted.current)message(error instanceof Error?error.message:String(error));
        }
      };
      active.getVideoTracks()[0]?.addEventListener('ended',()=>{
        if(writer.state==='recording')writer.stop();
      },{once:true});
      writer.start(500);
      setCapture('recording');
    }catch(error){
      acquired?.getTracks().forEach(track=>track.stop());
      if(mounted.current){
        setCapture('idle');
        message(error instanceof Error?error.message:String(error));
      }
    }
  }

  const watermark=watermarkAssets.some(asset=>asset.id===logo)?logo:watermarkAssets[0]?.id;
  const canCapture=typeof MediaRecorder!=='undefined';
  return <div className="content-tools">
    {section==='layers'&&<>
      <label className="dialog-field">Esquina<select value={corner} onChange={event=>setCorner(Number(event.target.value))}>
        {corners.map((label,index)=><option key={label} value={index}>{label}</option>)}
      </select></label>
      <button type="button" className="button secondary" disabled={!clip||!!clip.title}
        onClick={()=>updateClip({x:positions[corner][0],y:positions[corner][1],scale:.38})}>Colocar clip en la esquina</button>
      <label className="dialog-field">Forma, fondo o sticker<select value={graphic} onChange={event=>setGraphic(event.target.value as Graphic)}>
        {Object.entries(graphics).map(([id,label])=><option key={id} value={id}>{label}</option>)}
      </select></label>
      <div className="content-actions">
        <label>Color <input type="color" value={color} onChange={event=>setColor(event.target.value)}/></label>
        {graphic==='gradient'&&<label>Segundo color <input type="color" value={secondColor} onChange={event=>setSecondColor(event.target.value)}/></label>}
        <button type="button" className="button secondary" onClick={()=>insertGraphic(graphic,color,secondColor)}>Añadir gráfico</button>
      </div>
    </>}
    {section==='brand'&&<>
      <label className="dialog-field">Imagen para la marca de agua<select value={watermark??''} onChange={event=>setLogo(event.target.value)}>
        {!watermark&&<option value="">Importá una imagen a la biblioteca</option>}
        {watermarkAssets.map(asset=><option key={asset.id} value={asset.id}>{asset.name}</option>)}
      </select></label>
      <label className="dialog-field">Esquina de la marca<select value={corner} onChange={event=>setCorner(Number(event.target.value))}>
        {corners.map((label,index)=><option key={label} value={index}>{label}</option>)}
      </select></label>
      <button type="button" className="button secondary" disabled={!watermark} onClick={()=>watermark&&insertWatermark(watermark,corner)}>Añadir marca de agua</button>
      <div className="dialog-grid">
        <label className="dialog-field">Nombre<input maxLength={90} value={name} onChange={event=>setName(event.target.value)}/></label>
        <label className="dialog-field">Cargo<input maxLength={90} value={role} onChange={event=>setRole(event.target.value)}/></label>
      </div>
      <div className="content-actions">
        <button type="button" className="button secondary" disabled={!name.trim()} onClick={()=>insertLowerThird(name.trim(),role.trim())}>Insertar tercio inferior</button>
        <button type="button" className="button secondary" onClick={snapshot}>Guardar portada PNG</button>
      </div>
    </>}
    {section==='motion'&&<>
      <label className="dialog-field">Fundido del clip<select value={motion} onChange={event=>setMotion(event.target.value)}>
        <option value="in">Entrada</option><option value="out">Salida</option>
        <option value="both">Entrada y salida</option><option value="none">Sin fundido</option>
      </select></label>
      <label className="dialog-field">Duración (s)<input type="number" min=".1" max="5" step=".1" value={motionDuration} onChange={event=>setMotionDuration(Number(event.target.value))}/></label>
      <button type="button" className="button secondary" disabled={!clip||motionDuration<.1||motionDuration>5} onClick={()=>{
        if(!clip)return;
        const duration=Math.round(Math.min(clip.duration/2,motionDuration*SECOND));
        updateClip({fadeIn:motion==='in'||motion==='both'?duration:0,fadeOut:motion==='out'||motion==='both'?duration:0});
      }}>Aplicar fundido</button>
    </>}
    {section==='capture'&&<>
      <p className="hint">La grabación captura imagen y se añade al proyecto al detenerla. Si cerrás Ajustes durante la grabación, se descarta.</p>
      {capture==='recording'&&<video ref={preview} autoPlay playsInline muted aria-label="Vista previa de captura"/>}
      <div className="content-actions">
        <button type="button" className="button secondary" disabled={capture!=='idle'||!canCapture||!navigator.mediaDevices?.getDisplayMedia} onClick={()=>void record('screen')}>Grabar pantalla</button>
        <button type="button" className="button secondary" disabled={capture!=='idle'||!canCapture||!navigator.mediaDevices?.getUserMedia} onClick={()=>void record('camera')}>Grabar cámara</button>
        {capture==='recording'&&<button type="button" className="button primary" onClick={()=>{
          if(recorder.current?.state==='recording'){setCapture('stopping');recorder.current.stop();}
        }}>Detener y añadir</button>}
      </div>
      {capture==='starting'&&<p role="status">Esperando acceso a la fuente…</p>}
    </>}
    {section==='format'&&<>
      <label className="dialog-field content-checkbox">
        <input type="checkbox" disabled={!clip||!!clip.title||!!clip.audioOnly}
          checked={clip?.blurBackground===true} onChange={event=>updateClip({blurBackground:event.target.checked?true:undefined})}/>
        Fondo desenfocado del clip
      </label>
      <p className="hint">Útil al colocar un video horizontal en un proyecto vertical. Ajustá el ancho y alto arriba.</p>
    </>}
  </div>;
}
