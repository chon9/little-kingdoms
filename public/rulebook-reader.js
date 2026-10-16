import{comicMarkup,wireComic}from'/rulebook.js';
const all=new URLSearchParams(location.search).has('print');
const chapter=Number(new URLSearchParams(location.search).get('chapter')||0),page=Number.isInteger(chapter)&&chapter>=0&&chapter<12?chapter:0;
const root=document.getElementById('comic-reader');root.innerHTML=comicMarkup({all,page});wireComic(root);
document.getElementById('print-comic').onclick=()=>window.print();
if(window.kingdomsDesktop)document.getElementById('download-comic').hidden=true;
