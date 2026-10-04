const repo='UDteach/DeguDesktopVer2', releases=`https://github.com/${repo}/releases`;
try {
  const response=await fetch(`https://api.github.com/repos/${repo}/releases/latest`,{headers:{Accept:'application/vnd.github+json'}});
  if(!response.ok)throw Error();
  const release=await response.json();
  document.querySelector('#release-status').textContent=`配布版 ${release.tag_name} · ${release.published_at.slice(0,10)}公開`;
  for(const link of document.querySelectorAll('[data-artifact]')) {
    const asset=release.assets.find(a=>a.name.endsWith(`-${link.dataset.artifact}`));
    if(asset){link.href=asset.browser_download_url;link.title=`${asset.name} · ${(asset.size/1048576).toFixed(1)} MB`;}
    else {link.href=release.html_url;link.classList.add('unavailable');link.textContent+=' · 準備中';}
  }
  const checksums=release.assets.find(a=>a.name==='SHA256SUMS.txt');if(checksums)document.querySelector('#checksums').href=checksums.browser_download_url;
} catch {
  document.querySelector('#release-status').textContent='配布ファイルは準備中です。公開状況はGitHubのリリース一覧で確認できます。';
  for(const link of document.querySelectorAll('[data-artifact]')){link.classList.add('unavailable');link.href=releases;link.textContent+=' · 公開状況を見る';}
}
