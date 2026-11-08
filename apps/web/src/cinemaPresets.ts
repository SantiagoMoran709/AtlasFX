import {DEFAULT_GRADE,type CinemaGrade,type CinemaSettings} from '@corte/core';

function look(id:CinemaSettings['look'],label:string,
  grain:number,vignette:number,grade:Partial<CinemaGrade>){
  return {label,settings:{look:id,grain,vignette,lightLeak:0,intensity:1,grade:{...DEFAULT_GRADE,...grade}}};
}

export const cinemaPresets = [
  look('warm','Cálido de cine',.25,.25,{contrast:1.1,saturation:.95,temperature:18,lift:[0,0,.02],gain:[1.05,1,.92]}),
  look('teal','Teal & orange',.2,.2,{contrast:1.15,saturation:1.05,temperature:8,lift:[0,.03,.04],gain:[1.08,1,.9]}),
  look('cool','Frío noir',.35,.4,{exposure:-.3,contrast:1.25,saturation:.7,temperature:-20,lift:[0,.01,.03],gain:[.95,1,1.06]}),
  look('mono','Blanco y negro clásico',.45,.35,{contrast:1.3,saturation:0,lift:[.02,.02,.02],gain:[.98,.98,.98]}),
  look('vintage','Vintage 35 mm',.4,.3,{contrast:.95,saturation:.8,temperature:12,lift:[.04,.04,.04],gain:[1.04,1,.94]}),
  look('bleach','Blanqueo',.3,.25,{contrast:1.35,saturation:.55}),
  look('faded','Película desvanecida',.3,.15,{contrast:.85,saturation:.85,temperature:6,lift:[.06,.06,.06],gain:[.95,.95,.95]}),
  look('golden','Atardecer dorado',.15,.2,{contrast:1.05,saturation:1.1,temperature:30,lift:[0,0,.01],gain:[1.1,1,.85]}),
  look('blueNight','Noche azul',.3,.35,{exposure:-.8,contrast:1.15,saturation:.75,temperature:-35,lift:[0,.02,.05],gain:[.85,.95,1.1]}),
  look('sciFi','Ciencia ficción fría',.2,.25,{contrast:1.2,saturation:.85,temperature:-12,tint:-10,lift:[0,.03,.02],gain:[.95,1.02,1.03]}),
  look('cyberpunk','Cyberpunk / Sci-Fi',0,0,{contrast:1.25}),
  look('horror','Terror psicológico',0,.5,{contrast:1.3,saturation:.45,temperature:-25}),
  look('goldenHour','Golden Hour',0,0,{exposure:Math.log2(1.05),saturation:1.15,temperature:30}),
  look('bloodbath','Bloodbath',.03,0,{contrast:1.35}),
  look('portra','Portra 400',.02,0,{}),
  look('velvia','Velvia 50',0,0,{contrast:1.2,temperature:-5}),
  look('fineArt','Blanco y negro Fine Art',0,0,{contrast:1.4}),
];
