const repo='UDteach/DeguDesktopVer2', releases=`https://github.com/${repo}/releases`;
let preparing=false;
async function releaseJson(url,latest=false) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try {
    const response=await fetch(url,{headers:{Accept:'application/vnd.github+json'},signal:controller.signal});
    if(!response.ok){if(latest&&response.status===404)preparing=true;throw Error(`HTTP ${response.status}`);}
    return await response.json();
  } finally {clearTimeout(timer);}
}
try {
  let release;
  try {release=await releaseJson(`https://api.github.com/repos/${repo}/releases/latest`,true);}
  catch {release=await releaseJson('release.json');}
  const publishedDate=new Date(release.published_at).toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'});
  document.querySelector('#release-status').textContent=`配布版 ${release.tag_name} · ${publishedDate}公開`;
  for(const link of document.querySelectorAll('[data-artifact]')) {
    const asset=release.assets.find(a=>a.name.endsWith(`-${link.dataset.artifact}`));
    if(asset){link.href=asset.browser_download_url;link.title=`${asset.name} · ${(asset.size/1048576).toFixed(1)} MB`;}
    else {link.href=release.html_url;link.classList.add('unavailable');link.textContent+=' · 準備中';}
  }
  const checksums=release.assets.find(a=>a.name==='SHA256SUMS.txt');if(checksums)document.querySelector('#checksums').href=checksums.browser_download_url;
} catch {
  document.querySelector('#release-status').textContent=preparing
    ?'配布ファイルは準備中です。公開状況はGitHubのリリース一覧で確認できます。'
    :'配布情報を取得できませんでした。GitHubのリリース一覧からダウンロードできます。';
  for(const link of document.querySelectorAll('[data-artifact]')){link.classList.add('unavailable');link.href=releases;link.textContent+=' · 公開状況を見る';}
}
