"""Build a debug APK using installed Android SDK tools, without Gradle downloads."""
from pathlib import Path
import os,subprocess,tempfile,zipfile,xml.etree.ElementTree as ET,importlib.util,shutil
root=Path(__file__).resolve().parent
sdk=Path(os.environ.get('ANDROID_HOME',str(Path.home()/'Android/Sdk')))
platform=sorted((sdk/'platforms').glob('android-*'))[-1]/'android.jar'
tools=sorted((sdk/'build-tools').iterdir())[-1]
output=root.parent/'outputs';output.mkdir(exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
 t=Path(tmp);(t/'classes').mkdir();(t/'dex').mkdir()
 def run(*args):subprocess.run([str(x) for x in args],check=True)
 source=root/'android/app/src/main'
 manifest=(source/'AndroidManifest.xml').read_text().replace('<manifest ', '<manifest package="love.onlyyours" android:versionCode="18" android:versionName="0.4.5" ',1).replace(' <uses-permission',' <uses-sdk android:minSdkVersion="30" android:targetSdkVersion="35"/>\n <uses-permission',1)
 manifest=ET.fromstring(manifest)
 spec=importlib.util.spec_from_file_location('sdkbuild',root/'android-sdk-build.py');sdkbuild=importlib.util.module_from_spec(spec);spec.loader.exec_module(sdkbuild)
 (t/'firebase').mkdir();jars,resource_dirs,packages=sdkbuild.prepare(Path('/tmp/oy-firebase-sdk'),t/'firebase',manifest)
 ET.ElementTree(manifest).write(t/'AndroidManifest.xml',encoding='unicode')
 (t/'generated').mkdir()
 library_zips=[]
 for i,res in enumerate(resource_dirs):
  dest=t/('lib-'+str(i)+'.zip');run(tools/'aapt2','compile','--dir',res,'-o',dest);library_zips+=['-R',dest]

 shutil.copytree(source/'res',t/'app-res',ignore=shutil.ignore_patterns('*.example.xml'))
 run(tools/'aapt2','compile','--dir',t/'app-res','-o',t/'res.zip')
 run(tools/'aapt2','link',*library_zips,'-R',t/'res.zip','--auto-add-overlay','--extra-packages',':'.join(packages),'--java',t/'generated','-I',platform,'--manifest',t/'AndroidManifest.xml','-o',t/'base.apk')
 run('javac','-source','8','-target','8','-classpath',os.pathsep.join(map(str,[platform,*jars])),'-d',t/'classes',*list((source/'java').rglob('*.java')),*list((t/'generated').rglob('*.java')))
 run(tools/'d8','--min-api','30','--lib',platform,'--output',t/'dex',*list((t/'classes').rglob('*.class')),*jars)
 with zipfile.ZipFile(t/'base.apk','a',zipfile.ZIP_DEFLATED) as z:
  for p in (t/'dex').glob('*.dex'):z.write(p,p.name)
  java_resources={};services={}
  for jar in jars:
   with zipfile.ZipFile(jar) as lib:
    for name in lib.namelist():
     if name.endswith('/') or name.endswith('.class') or name.upper().endswith(('.SF','.RSA','.DSA')) or name=='META-INF/MANIFEST.MF':continue
     if name.startswith('META-INF/services/'):services.setdefault(name,set()).update(lib.read(name).decode().splitlines())
     else:java_resources.setdefault(name,lib.read(name))
  for name,body in java_resources.items():z.writestr(name,body)
  for name,lines in services.items():z.writestr(name,'\n'.join(sorted(lines))+'\n')

 run(tools/'zipalign','-f','4',t/'base.apk',t/'aligned.apk')
 signing_password=os.environ.get('ONLY_YOURS_DEV_KEY_PASSWORD')
 if not signing_password:raise RuntimeError('Set ONLY_YOURS_DEV_KEY_PASSWORD to sign a development APK')
 if not (root/'android/development-signing.p12').exists():run('keytool','-genkeypair','-keystore',root/'android/development-signing.p12','-storepass',signing_password,'-alias','onlyyours','-keypass',signing_password,'-dname','CN=Only Yours Development','-keyalg','RSA','-keysize','2048','-validity','3650','-noprompt')
 target=output/'Only_Yours.apk'
 run(tools/'apksigner','sign','--ks',root/'android/development-signing.p12','--ks-key-alias','onlyyours','--ks-pass','env:ONLY_YOURS_DEV_KEY_PASSWORD','--out',target,t/'aligned.apk')
 run(tools/'apksigner','verify','--verbose',target)
 print(target)
