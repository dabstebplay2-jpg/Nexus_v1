/** @param {import('app-builder-lib').AfterPackContext} context */
module.exports = async function afterPack(context) {
  const path = require('path');
  const { rcedit } = await import('rcedit');

  const projectDir = context.packager.projectDir;
  const iconPath = path.join(projectDir, 'product', 'brand', 'icon.ico');
  const exePath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.exe`
  );

  console.log(`Embedding Nexus icon into ${exePath}`);
  await rcedit(exePath, {
    icon: iconPath,
    'version-string': {
      ProductName: 'Nexus Browser',
      FileDescription: 'Nexus Browser',
      CompanyName: 'Nexus',
      OriginalFilename: 'Nexus Browser.exe',
    },
  });
};
