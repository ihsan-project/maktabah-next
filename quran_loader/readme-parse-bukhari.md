Using this script to convert the txt file to an xml that can be used by `load-hadith-to-storage`
```bash
node parse-bukhari-xml.js sahih_bukhari-muhsin.txt translations
```

This will create a set of xml files, eg. `translations/en.bukhari.vol01.xml`

The `sahih_bukhari-muhsin.txt` was found from https://islamsource.azurewebsites.net/host.aspx?Page=hadithsource. Specifically https://islamsource.azurewebsites.net/host.aspx?Page=Source&File=bukhari.en-muhsin_khan.txt