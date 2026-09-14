importScripts('engine.js','tsume-solver.js');
self.onmessage=event=>{try{self.postMessage({ok:true,...TsumeSolver.verify(event.data,createShogiEngine,{budgetMs:15000})});}catch(error){self.postMessage({ok:false,error:error.message});}};
