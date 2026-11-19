"""Merge the official resolved Firebase AAR resources and manifests for standalone builds."""
from pathlib import Path
import json,zipfile,xml.etree.ElementTree as ET,copy
A='{http://schemas.android.com/apk/res/android}'
ET.register_namespace('android','http://schemas.android.com/apk/res/android')
def prepare(cache,target,manifest):
 records=json.loads((cache/'dependencies.json').read_text());jars=[];resources=[];packages=[];app=manifest.find('application');permissions={p.get(A+'name') for p in manifest.findall('uses-permission')}
 names={(x['group'],x['name']) for x in records}
 for item in records:
  if item['name'].endswith('-jvm') and (item['group'],item['name'][:-4]+'-android') in names:continue
  path=Path(item['path'])
  if path.suffix=='.jar':jars.append(path);continue
  if path.suffix!='.aar':continue
  folder=target/path.stem;folder.mkdir()
  with zipfile.ZipFile(path) as archive:archive.extractall(folder)
  jars+=list(folder.glob('classes.jar'))+list(folder.glob('libs/*.jar'))
  if (folder/'res').exists():resources.append(folder/'res')
  if not (folder/'AndroidManifest.xml').exists():continue
  lib=ET.parse(folder/'AndroidManifest.xml').getroot();package=lib.get('package')
  if package:packages.append(package)
  for perm in [*lib.findall('permission'),*lib.findall('uses-permission')]:
   perm=copy.deepcopy(perm)
   for key,value in list(perm.attrib.items()):perm.set(key,value.replace('${applicationId}','love.onlyyours'))
   if perm.tag=='permission' or perm.get(A+'name') not in permissions:
    manifest.append(copy.deepcopy(perm))
    if perm.tag=='uses-permission':permissions.add(perm.get(A+'name'))
  for child in list(lib.find('application') or []):
   name=child.get(A+'name','')
   if name.startswith('.'):child.set(A+'name',package+name)
   child=copy.deepcopy(child)
   for node in child.iter():
    for key,value in list(node.attrib.items()):
     if key.startswith('{http://schemas.android.com/tools}'):del node.attrib[key]
     else:node.set(key,value.replace('${applicationId}','love.onlyyours'))
   existing=next((x for x in app if x.tag==child.tag and x.get(A+'name')==child.get(A+'name')),None)
   if existing is None:app.append(child)
   else:
    for sub in child:
     if not any(x.tag==sub.tag and x.get(A+'name')==sub.get(A+'name') for x in existing):existing.append(sub)
 return jars,resources,packages
