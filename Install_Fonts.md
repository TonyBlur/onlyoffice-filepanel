### Download the fonts package (commonChineseFonts.tar as an example)
curl -O https://raw.githubusercontent.com/TonyBlur/onlyoffice-filepanel/main/commonChineseFonts.tar

### Get the ContainerID of your OnlyOffice Document Server container from the previous command
docker ps

### Replace [ContainerID] with the actual ContainerID
docker cp commonChineseFonts.tar [ContainerID]:/usr/share/fonts/

### Access the container's shell
docker exec -it [ContainerID] /bin/bash

### Inside the container, navigate to the fonts directory
cd /usr/share/fonts

### Extract the fonts package
tar -xf commonChineseFonts.tar

### Move the extracted font files to the current directory
mv commonChineseFonts/* ./

### Clean up the tar file and extracted folder (Optional)
rm commonChineseFonts.tar
rm -r commonChineseFonts

### Rebuild the font cache
/usr/bin/documentserver-generate-allfonts.sh