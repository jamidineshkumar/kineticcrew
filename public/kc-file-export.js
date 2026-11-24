(function(){'use strict';
async function saveXlsx(workbook,filename){
 const bytes=window.XLSX.write(workbook,{bookType:'xlsx',type:'array'});
 if(window.Capacitor?.isNativePlatform?.()){
  const plugin=window.Capacitor?.Plugins?.KcFileExport;
  if(!plugin?.saveFile)throw new Error('Android file saver is unavailable. Please update the Kinetic Crew app.');
  const data=new Uint8Array(bytes);let binary='';const chunk=0x8000;
  for(let i=0;i<data.length;i+=chunk)binary+=String.fromCharCode(...data.subarray(i,Math.min(i+chunk,data.length)));
  const result=await plugin.saveFile({filename,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',base64:btoa(binary)});
  if(!result?.saved)throw new Error('Android did not confirm that the Excel file was saved.');
  return {saved:true,native:true,filename:result.filename||filename};
 }
 const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;a.style.display='none';document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),60000);
 return {saved:true,native:false,filename};
}
window.KcFileExport={saveXlsx};
})();