import {useEffect,useState} from 'react';
export const gainToDb=(gain:number)=>gain<=.001?-60:Math.max(-60,20*Math.log10(gain));
export const dbToGain=(db:number)=>db<=-60?0:Math.min(2,10**(db/20));
export function Parameter({label,value,min,max,step=1,unit='',disabled=false,onCommit,onPreview,vertical=false}:{label:string;value:number;min:number;max:number;step?:number;unit?:string;disabled?:boolean;onCommit:(value:number)=>void;onPreview?:(value?:number)=>void;vertical?:boolean}){
 const [draft,setDraft]=useState(value);useEffect(()=>setDraft(value),[value]);const precision=step<1?Math.min(3,(String(step).split('.')[1]??'').length):0;
 function finish(n:number){if(n!==value)onCommit(n);onPreview?.();}
 return <label className={`parameter ${vertical?'vertical-parameter':''}`}><span className="parameter-label">{label}<output>{draft.toFixed(precision)}{unit}</output></span><input aria-label={label} type="range" min={min} max={max} step={step} value={draft} disabled={disabled} onChange={e=>{const n=Number(e.target.value);setDraft(n);onPreview?.(n);}} onPointerUp={e=>finish(Number(e.currentTarget.value))} onPointerCancel={()=>{setDraft(value);onPreview?.();}} onKeyUp={e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(e.key))finish(Number(e.currentTarget.value));}} onBlur={e=>finish(Number(e.currentTarget.value))}/></label>;
}
