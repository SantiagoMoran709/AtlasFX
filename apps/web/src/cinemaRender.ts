import {cinemaHeight, SECOND, type CinemaSettings} from '@corte/core';
import {createCatalogGrade} from './catalogGrade';

const grades: Partial<Record<CinemaSettings['look'], (amount: number) => string>> = {
  neutral: ()=>'none',
  warm: a=>`sepia(${.38*a}) contrast(${1+.16*a}) saturate(${1+.12*a})`,
  cool: a=>`sepia(${.3*a}) hue-rotate(${165*a}deg) contrast(${1+.22*a}) saturate(${1-.34*a})`,
  mono: a=>`grayscale(${a}) contrast(${1+.24*a})`,
  vintage: a=>`sepia(${.45*a}) contrast(${1-.18*a}) saturate(${1-.25*a})`,
  clean: a=>`contrast(${1+.12*a}) saturate(${1+.18*a})`,
};

export function cinemaGrade(settings?: CinemaSettings) {
  return settings && !settings.grade && settings.look!=='neutral' && settings.intensity>0
    ? grades[settings.look]?.(settings.intensity) ?? ''
    : '';
}

export class CinemaRenderer {
  private noise?: CanvasPattern;
  private catalog?: ReturnType<typeof createCatalogGrade> | null;

  draw(ctx: CanvasRenderingContext2D, settings: CinemaSettings, time: number) {
    const {width,height}=ctx.canvas;
    ctx.save();
    if(settings.grade&&settings.intensity>0){
      if(this.catalog===undefined)this.catalog=createCatalogGrade()??null;
      const graded=this.catalog?.draw(ctx.canvas,settings);
      if(graded)ctx.drawImage(graded,0,0);
      else {
        const {exposure,contrast,saturation}=settings.grade;
        const amount=settings.intensity;
        ctx.filter=`brightness(${2**(exposure*amount)}) contrast(${1+(contrast-1)*amount}) saturate(${1+(saturation-1)*amount})`;
        ctx.drawImage(ctx.canvas,0,0);
        ctx.filter='none';
      }
    }
    if(settings.lightLeak>0){
      const x=width*(.85+.12*Math.sin(time/SECOND));
      const y=height*.12;
      const glow=ctx.createRadialGradient(x,y,0,x,y,Math.max(width,height)*.65);
      glow.addColorStop(0,`rgba(255,106,44,${settings.lightLeak*.7})`);
      glow.addColorStop(1,'rgba(255,106,44,0)');
      ctx.globalCompositeOperation='screen';
      ctx.fillStyle=glow;
      ctx.fillRect(0,0,width,height);
      ctx.globalCompositeOperation='source-over';
    }
    if(settings.vignette>0){
      ctx.save();
      ctx.scale(width,height);
      const shadow=ctx.createRadialGradient(.5,.5,.24,.5,.5,.72);
      shadow.addColorStop(0,'transparent');
      shadow.addColorStop(1,`rgba(0,0,0,${settings.vignette*.9})`);
      ctx.fillStyle=shadow;
      ctx.fillRect(0,0,1,1);
      ctx.restore();
    }
    if(settings.grain>0){
      const pattern=this.noise??=createNoise(ctx);
      const frame=Math.floor(time*24/SECOND);
      pattern.setTransform(new DOMMatrix().translate((frame*53)%128,(frame*79)%128));
      ctx.globalCompositeOperation='soft-light';
      ctx.globalAlpha=settings.grain*.65;
      ctx.fillStyle=pattern;
      ctx.fillRect(0,0,width,height);
      ctx.globalAlpha=1;
      ctx.globalCompositeOperation='source-over';
    }
    const visible=cinemaHeight(width,height,settings.ratio);
    const top=Math.floor((height-visible)/2);
    if(visible<height){
      ctx.fillStyle='#000';
      ctx.fillRect(0,0,width,top);
      ctx.fillRect(0,top+visible,width,height-top-visible);
    }
    ctx.restore();
  }

  dispose(){this.catalog?.dispose();}
}

function createNoise(ctx: CanvasRenderingContext2D) {
  const tile=document.createElement('canvas');
  tile.width=tile.height=128;
  const target=tile.getContext('2d')!;
  const pixels=target.createImageData(128,128);
  let seed=9173;
  for(let i=0;i<pixels.data.length;i+=4){
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    const gray=seed>>>24;
    pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=gray;
    pixels.data[i+3]=255;
  }
  target.putImageData(pixels,0,0);
  return ctx.createPattern(tile,'repeat')!;
}
