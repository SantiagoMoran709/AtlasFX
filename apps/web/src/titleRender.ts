import type {TitleStyle} from '@corte/core';

export interface TitleViewport {
  x:number;
  y:number;
  width:number;
  height:number;
}

export function drawTitle(
  ctx:CanvasRenderingContext2D,
  title:TitleStyle,
  size:number,
  viewportWidth:number,
  remainingWidth:number,
) {
  const {height}=ctx.canvas;
  ctx.fillStyle=title.color;
  ctx.font=titleFont(title,size,title.bold);
  ctx.textAlign='center';
  ctx.textBaseline='middle';

  if(title.preset==='lowerThird'){
    drawLowerThird(ctx,title,size,Math.max(0,remainingWidth-viewportWidth*.05));
    return;
  }

  const maxWidth=viewportWidth*.9;
  if(title.preset==='opening'){
    ctx.letterSpacing=`${Math.max(4*height/1080,size*.085)}px`;
    drawLines(ctx,title.text.toLocaleUpperCase('es').split(/\r?\n/),size,maxWidth);
    return;
  }

  if(title.preset==='subtitle'){
    const lines=wrapSubtitle(ctx,title.text,maxWidth);
    if(title.background){
      const blockWidth=Math.min(maxWidth,Math.max(...lines.map(line=>ctx.measureText(line).width)));
      const pad=size*.28;
      const blockHeight=lines.length*size*1.2+pad;
      ctx.fillStyle='rgba(0,0,0,.3)';
      ctx.fillRect(-blockWidth/2-pad,-blockHeight/2,blockWidth+2*pad,blockHeight);
      ctx.fillStyle=title.color;
    }
    const scale=height/1080;
    ctx.shadowColor='rgba(0,0,0,.8)';
    ctx.shadowOffsetY=2*scale;
    ctx.shadowBlur=4*scale;
    drawLines(ctx,lines,size,maxWidth);
    return;
  }

  // Projects saved before presets retain their original title and outline.
  ctx.strokeStyle='#000';
  ctx.lineWidth=Math.max(1,size*.12);
  ctx.lineJoin='round';
  drawLines(ctx,title.text.split(/\r?\n/),size,maxWidth,title.outline);
}

function titleFont(title:TitleStyle,size:number,bold:boolean) {
  return `${bold?'700':'400'} ${size}px ${title.font?`"${title.font}", `:''}sans-serif`;
}

function drawLines(ctx:CanvasRenderingContext2D,lines:string[],size:number,maxWidth:number,outline=false) {
  lines.forEach((line,index)=>{
    const y=(index-(lines.length-1)/2)*size*1.2;
    if(outline)ctx.strokeText(line,0,y,maxWidth);
    ctx.fillText(line,0,y,maxWidth);
  });
}

function wrapSubtitle(ctx:CanvasRenderingContext2D,text:string,maxWidth:number) {
  return text.split(/\r?\n/).flatMap(paragraph=>{
    const lines:string[]=[];
    let line='';
    for(const word of paragraph.trim().split(/\s+/)){
      const next=line?`${line} ${word}`:word;
      if(line&&ctx.measureText(next).width>maxWidth){
        lines.push(line);
        line=word;
      }else{
        line=next;
      }
    }
    return [...lines,line];
  });
}

function drawLowerThird(ctx:CanvasRenderingContext2D,title:TitleStyle,size:number,availableWidth:number) {
  const padX=size*.48;
  const padY=size*.3;
  if(availableWidth<=padX*2)return;
  const name=title.text.replace(/\s+/g,' ').trim();
  const role=title.roleText?.replace(/\s+/g,' ').trim();
  if(!name&&!role)return;
  const nameFont=titleFont(title,size,title.bold);
  const roleFont=titleFont(title,size*.62,false);
  ctx.font=nameFont;
  const nameWidth=ctx.measureText(name).width;
  ctx.font=roleFont;
  const roleWidth=role?ctx.measureText(role).width:0;
  const width=Math.min(availableWidth,Math.max(nameWidth,roleWidth)+padX*2);
  const height=(role?1.9:1.15)*size+padY*2;
  const top=-height/2;
  ctx.fillStyle='rgba(0,0,0,.56)';
  ctx.strokeStyle='rgba(255,255,255,.16)';
  ctx.lineWidth=Math.max(.6,size*.018);
  ctx.beginPath();
  ctx.roundRect(0,top,width,height,size*.16);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle='#8ad1c5';
  ctx.fillRect(size*.13,top+padY,Math.max(1,size*.06),height-padY*2);
  ctx.textAlign='left';
  ctx.font=nameFont;
  ctx.fillStyle=title.color;
  const textWidth=width-padX*2;
  ctx.fillText(name,padX,role?top+padY+size*.53:0,textWidth);
  if(role){
    ctx.font=roleFont;
    ctx.fillStyle='#d4d9e2';
    ctx.fillText(role,padX,top+padY+size*1.43,textWidth);
  }
}
