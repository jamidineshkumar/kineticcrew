package com.kineticcrew.hq;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.ActivityResult;
import com.getcapacitor.JSObject;
import java.io.OutputStream;
@CapacitorPlugin(name="KcFileExport")
public class KcFileExportPlugin extends Plugin {
 @PluginMethod public void saveFile(PluginCall call){
  String filename=call.getString("filename","kinetic-crew-export.xlsx");
  String mime=call.getString("mimeType","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  String base64=call.getString("base64");
  if(base64==null||base64.isEmpty()){call.reject("Excel file data is empty.");return;}
  Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);
  intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType(mime);
  intent.putExtra(Intent.EXTRA_TITLE,filename);
  startActivityForResult(call,intent,"saveFileResult");
 }
 @ActivityCallback private void saveFileResult(PluginCall call, ActivityResult result){
  if(call==null)return;
  if(result.getResultCode()!=android.app.Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){call.reject("Save cancelled. Choose a folder to save the Excel file.");return;}
  Uri uri=result.getData().getData();
  try{
   String base64=call.getString("base64");
   byte[] bytes=Base64.decode(base64,Base64.DEFAULT);
   try(OutputStream out=getContext().getContentResolver().openOutputStream(uri,"w")){if(out==null)throw new java.io.IOException("Could not open the selected file.");out.write(bytes);out.flush();}
   JSObject ret=new JSObject();ret.put("saved",true);ret.put("filename",uri.getLastPathSegment());call.resolve(ret);
  }catch(Exception e){call.reject("Could not save Excel file: "+(e.getMessage()==null?"storage error":e.getMessage()),e);}
 }
}