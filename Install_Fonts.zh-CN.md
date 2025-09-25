### 下载字体包（以常用中文字体为例）
curl -O https://raw.githubusercontent.com/TonyBlur/onlyoffice-filepanel/main/commonChineseFonts.tar

### 获取 OnlyOffice Document Server 容器的 ContainerID
docker ps

### 将 [ContainerID] 替换为实际的 ContainerID
docker cp commonChineseFonts.tar [ContainerID]:/usr/share/fonts/

### 访问容器的 shell
docker exec -it [ContainerID] /bin/bash

### 在容器内，导航到字体目录
cd /usr/share/fonts

### 解压字体包
tar -xf commonChineseFonts.tar

### 将解压后的字体文件移动到当前目录
mv commonChineseFonts/* ./

### 清理 tar 文件和解压后的文件夹（可选）
rm commonChineseFonts.tar
rm -r commonChineseFonts

### 重建字体缓存
/usr/bin/documentserver-generate-allfonts.sh