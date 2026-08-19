
const qs=(s,c=document)=>c.querySelector(s), qsa=(s,c=document)=>[...c.querySelectorAll(s)];
document.addEventListener('DOMContentLoaded',()=>{
  qsa('.reveal').forEach((el,i)=>{el.style.transitionDelay=(i%6)*.05+'s'});
  const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.12});
  qsa('.reveal').forEach(e=>io.observe(e));
  const nav=qs('#nav-inner'); if(nav){addEventListener('scroll',()=>{const c=scrollY>80;nav.style.backgroundColor=c?'rgba(6,7,9,.72)':'rgba(6,7,9,0)';nav.style.borderColor=c?'rgba(255,255,255,.07)':'transparent';nav.style.paddingTop=c?'14px':'26px';nav.style.paddingBottom=c?'14px':'26px'})}
  const p=qs('#particles'); if(p){for(let i=0;i<90;i++){let s=document.createElement('span');s.className='particle';s.style.left=Math.random()*100+'%';s.style.top=Math.random()*100+'%';s.style.setProperty('--x',(Math.random()*80-40)+'px');s.style.setProperty('--y',(Math.random()*80-40)+'px');s.style.setProperty('--d',(4+Math.random()*8)+'s');s.style.animationDelay=(-Math.random()*8)+'s';p.appendChild(s)}}
  qsa('.arena-item').forEach(item=>item.addEventListener('mouseenter',()=>{qsa('.arena-item').forEach(x=>x.classList.remove('active'));item.classList.add('active');let art=qs('#arena-art');art.style.backgroundImage=item.dataset.art;qs('#arena-kind').textContent=item.querySelector('.label').textContent;qs('#arena-index').textContent=item.querySelector('.label').previousElementSibling?.textContent||item.querySelector('.label').textContent}));
  const pg=qs('#partner-grid');if(pg)pg.addEventListener('pointermove',e=>{const r=pg.getBoundingClientRect();pg.style.setProperty('--mx',(e.clientX-r.left)+'px');pg.style.setProperty('--my',(e.clientY-r.top)+'px')});
});
