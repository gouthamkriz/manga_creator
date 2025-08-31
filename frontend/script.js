/* script.js
   Shared logic for all pages in the static site.
   - Uses localStorage for persistence.
   - Exposes per-page init functions that run depending on body[data-page].
*/

/* ---------------------------
   Simple in-browser DB + counters
   --------------------------- */
const STORAGE_KEY = 'mangaStudioDB.v1';
const COUNTERS_KEY = 'mangaStudioCounters.v1';

const DB = {
  characters: [], // {id,name,age,height,desc,avatar,costumes:[],ages:[],changes:[]}
  objects: [],    // {id,name,height,color,desc}
  frames: [],     // {id,background,blocks:[{id,label,props}]}
  pages: [],      // {id,slots:[{id,frameId,x,y,w,h}]}
  books: []       // {id,title,pageIds:[]}
};

const COUNTERS = { C:0, CO:0, A:0, CH:0, O:0, F:0, P:0, B:0, S:0 };

/* Persist/load helpers */
function saveDB(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(DB)); }
function loadDB(){ try{ const raw = localStorage.getItem(STORAGE_KEY); if(raw) Object.assign(DB, JSON.parse(raw)); }catch(e){ console.warn('loadDB failed', e); } }
function saveCounters(){ localStorage.setItem(COUNTERS_KEY, JSON.stringify(COUNTERS)); }
function loadCounters(){ try{ const raw = localStorage.getItem(COUNTERS_KEY); if(raw) Object.assign(COUNTERS, JSON.parse(raw)); }catch(e){ console.warn('loadCounters failed', e); } }

function nextId(prefix){
  COUNTERS[prefix] = (COUNTERS[prefix]||0) + 1;
  saveCounters();
  return `${prefix}-${String(COUNTERS[prefix]).padStart(4,'0')}`;
}

/* Tiny helpers */
const $ = (sel,root=document)=>root.querySelector(sel);
const $$ = (sel,root=document)=>[...root.querySelectorAll(sel)];

/* Initialize common DB/counters on startup */
loadDB(); loadCounters();

/* ---------------------------
   HOME page init: show workspace counts
   --------------------------- */
function initHome(){
  $('#home-count-chars').textContent = DB.characters.length;
  $('#home-count-objects').textContent = DB.objects.length;
  $('#home-count-frames').textContent = DB.frames.length;
  $('#home-count-pages').textContent = DB.pages.length;
  $('#home-count-books').textContent = DB.books.length;
}

/* ---------------------------
   CHARACTER page logic
   --------------------------- */
function initCharacter(){
  // DOM elements
  const nameInput = $('#c-name'), ageInput = $('#c-age'), heightInput = $('#c-height'), descInput = $('#c-desc');
  const genBtn = $('#generate-candidates'), regenBtn = $('#regenerate-candidates'), grid = $('#candidate-grid');
  const listEl = $('#character-list'), managePanel = $('#char-manage'), manageTitle = $('#manage-title'), manageId = $('#manage-id');

  // manage sub-elements
  const costumeName = $('#costume-name'), costumeDesc = $('#costume-desc'), addCostumeBtn = $('#add-costume'), costumeList = $('#costume-list');
  const ageVal = $('#age-val'), ageNotes = $('#age-notes'), addAgeBtn = $('#add-age'), ageList = $('#age-list');
  const chgWhen = $('#chg-when'), chgWhat = $('#chg-what'), addChgBtn = $('#add-change'), changeList = $('#change-list');

  let selectedCharacterId = null; // currently managed character

  function renderCharacterList(){
    listEl.innerHTML = '';
    if(DB.characters.length===0){ listEl.innerHTML = '<div class="small">No characters yet. Create one above.</div>'; return; }
    DB.characters.forEach(c=>{
      const item = document.createElement('div'); item.className = 'item';
      item.innerHTML = `<div>
        <div style="font-weight:700">${c.name || 'Unnamed'}</div>
        <div class="small">${c.id} ${c.age? ' • Age '+c.age:''}</div>
      </div>
      <div>
        <button class="btn" data-id="${c.id}" data-action="manage">Manage</button>
        <button style="background:${'#ef4444'}" class="btn" data-id="${c.id}" data-action="delete">Delete</button>
      </div>`;
      listEl.appendChild(item);
    });
    // wire buttons
    $$('[data-action="manage"]', listEl).forEach(b=>b.addEventListener('click', e=>openManage(e.target.dataset.id)));
    $$('[data-action="delete"]', listEl).forEach(b=>b.addEventListener('click', e=>{
      if(!confirm('Delete this character?')) return;
      const id = e.target.dataset.id;
      DB.characters = DB.characters.filter(x=>x.id!==id); saveDB(); renderCharacterList();
    }));
  }

  function generateCandidates(){
    const name = nameInput.value.trim(); const age = ageInput.value.trim(); const height = heightInput.value.trim(); const desc = descInput.value.trim();
    if(!name){ alert('Enter a name first'); return; }
    grid.innerHTML = '';
    // simulate 6 variants using emoji avatars
    const variants = ['🧑🏻','🧑🏾','🧑🏼‍🦰','🧑🏽‍🦱','🧑🏿‍🦲','🧑‍🎤'];
    variants.forEach((icon,i)=>{
      const card = document.createElement('div'); card.className = 'card';
      card.innerHTML = `<div style="font-size:36px">${icon}</div><div class="small">Variant ${i+1}</div>
        <div style="margin-top:8px"><button class="btn" data-action="select">Select</button></div>`;
      // select saves character with this avatar
      card.querySelector('[data-action="select"]').addEventListener('click', ()=>{
        const id = nextId('C');
        const ch = { id, name, age: age?Number(age):undefined, height: height?Number(height):undefined, desc, avatar:icon, costumes:[], ages:[], changes:[] };
        DB.characters.push(ch); saveDB(); renderCharacterList(); grid.innerHTML=''; nameInput.value=''; ageInput.value=''; heightInput.value=''; descInput.value='';
        alert(`Saved character ${id}`); openManage(id);
      });
      grid.appendChild(card);
    });
  }

  function openManage(id){
    const ch = DB.characters.find(x=>x.id===id); if(!ch) return;
    selectedCharacterId = id;
    managePanel.style.display='block';
    manageTitle.textContent = ch.name;
    manageId.textContent = ch.id;
    renderCostumes(); renderAges(); renderChanges();
  }

  function renderCostumes(){
    costumeList.innerHTML = '';
    const ch = DB.characters.find(x=>x.id===selectedCharacterId); if(!ch) return;
    if(ch.costumes.length===0) costumeList.innerHTML = '<div class="small">No costumes yet.</div>';
    ch.costumes.forEach(co=>{
      const el = document.createElement('div'); el.className='item';
      el.innerHTML = `<div><div style="font-weight:700">${co.name}</div><div class="small">${co.id}</div></div>
        <div>${co.isDefault? '<span class="small">Default</span>':''} <button class="btn" data-action="del" data-id="${co.id}">Delete</button></div>`;
      costumeList.appendChild(el);
      el.querySelector('[data-action="del"]').addEventListener('click', ()=>{
        ch.costumes = ch.costumes.filter(x=>x.id!==co.id); saveDB(); renderCostumes();
      });
    });
  }

  function renderAges(){
    ageList.innerHTML = '';
    const ch = DB.characters.find(x=>x.id===selectedCharacterId); if(!ch) return;
    if(ch.ages.length===0) ageList.innerHTML = '<div class="small">No age states yet.</div>';
    ch.ages.forEach(a=>{
      const el = document.createElement('div'); el.className='item';
      el.innerHTML = `<div><div style="font-weight:700">Age ${a.age}</div><div class="small">${a.id}</div></div>
        <div><button class="btn" data-id="${a.id}" data-action="del">Delete</button></div>`;
      ageList.appendChild(el);
      el.querySelector('[data-action="del"]').addEventListener('click', ()=>{ ch.ages = ch.ages.filter(x=>x.id!==a.id); saveDB(); renderAges(); });
    });
  }

  function renderChanges(){
    changeList.innerHTML = '';
    const ch = DB.characters.find(x=>x.id===selectedCharacterId); if(!ch) return;
    if(ch.changes.length===0) changeList.innerHTML = '<div class="small">No changes yet.</div>';
    ch.changes.forEach(c=>{
      const el = document.createElement('div'); el.className='item';
      el.innerHTML = `<div><div style="font-weight:700">${c.when||'When unspecified'}</div><div class="small">${c.id}</div></div>
        <div><button class="btn" data-id="${c.id}" data-action="del">Delete</button></div>`;
      changeList.appendChild(el);
      el.querySelector('[data-action="del"]').addEventListener('click', ()=>{ ch.changes = ch.changes.filter(x=>x.id!==c.id); saveDB(); renderChanges(); });
    });
  }

  // add costume
  addCostumeBtn.addEventListener('click', ()=>{
    const ch = DB.characters.find(x=>x.id===selectedCharacterId); if(!ch){ alert('Open a saved character first'); return; }
    const name = costumeName.value.trim(); const desc = costumeDesc.value.trim();
    if(!name){ alert('Costume name required'); return; }
    const id = nextId('CO');
    ch.costumes.push({id, name, desc, isDefault: ch.costumes.length===0});
    saveDB(); costumeName.value=''; costumeDesc.value=''; renderCostumes();
  });

  addAgeBtn.addEventListener('click', ()=>{
    const ch = DB.characters.find(x=>x.id===selectedCharacterId); if(!ch){ alert('Open a saved character first'); return; }
    const age = Number(ageVal.value); const notes = ageNotes.value.trim();
    if(Number.isNaN(age)){ alert('Provide an age number'); return; }
    const id = nextId('A');
    ch.ages.push({id, age, notes}); saveDB(); ageVal.value=''; ageNotes.value=''; renderAges();
  });

  addChgBtn.addEventListener('click', ()=>{
    const ch = DB.characters.find(x=>x.id===selectedCharacterId); if(!ch){ alert('Open a saved character first'); return; }
    const when = chgWhen.value.trim(), what = chgWhat.value.trim();
    if(!what){ alert('Describe the change'); return; }
    const id = nextId('CH'); ch.changes.push({id, when, what}); saveDB(); chgWhen.value=''; chgWhat.value=''; renderChanges();
  });

  // attach generate buttons
  genBtn.addEventListener('click', generateCandidates);
  regenBtn.addEventListener('click', generateCandidates);

  // initial render
  renderCharacterList();
}

/* ---------------------------
   OBJECT page logic
   --------------------------- */
function initObject(){
  const name = $('#o-name'), height = $('#o-height'), color = $('#o-color'), desc = $('#o-desc'), addBtn = $('#add-object');
  const list = $('#object-list');

  function renderObjects(){
    list.innerHTML = '';
    if(DB.objects.length===0){ list.innerHTML = '<div class="small">No objects yet.</div>'; return; }
    DB.objects.forEach(o=>{
      const el = document.createElement('div'); el.className='item';
      el.innerHTML = `<div><div style="font-weight:700">${o.name}</div><div class="small">${o.id} ${o.height? '• '+o.height+'cm':''}</div></div>
        <div><button class="btn" data-id="${o.id}" data-action="del">Delete</button></div>`;
      list.appendChild(el);
    });
    $$('[data-action="del"]', list).forEach(b=>b.addEventListener('click', e=>{ if(!confirm('Delete object?')) return; DB.objects = DB.objects.filter(x=>x.id!==e.target.dataset.id); saveDB(); renderObjects(); }));
  }

  addBtn.addEventListener('click', ()=>{
    const n = name.value.trim(); const h = Number(height.value||0); const c = color.value; const d = desc.value.trim();
    if(!n){ alert('Name required'); return; }
    const id = nextId('O'); DB.objects.push({id,name:n,height:h||undefined,color:c,desc:d}); saveDB(); name.value=''; height.value=''; desc.value=''; renderObjects(); alert(`Saved object ${id}`);
  });

  renderObjects();
}

/* ---------------------------
   PLOTTER page logic
   --------------------------- */
function initPlotter(){
  const input = $('#plot-input'), createBtn = $('#create-plot');
  const workList = $('#frames-work-list'), savedList = $('#frames-saved');

  function makeBlockRow(block){ // block: {label,props}
    const wrap = document.createElement('div'); wrap.className='item';
    wrap.innerHTML = `<div style="width:70%"><div style="font-weight:700">${block.label}</div><div class="small">${block.props}</div></div>
      <div><button class="btn" data-action="edit">Edit</button></div>`;
    wrap.querySelector('[data-action="edit"]').addEventListener('click', ()=>{
      const newLabel = prompt('Label', block.label); const newProps = prompt('Props', block.props);
      if(newLabel!=null) block.label=newLabel; if(newProps!=null) block.props=newProps;
      saveDraft();
    });
    return wrap;
  }

  function saveDraft(){ /* recalc UI state if needed */ }

  createBtn.addEventListener('click', ()=>{
    const text = input.value.trim(); if(!text){ alert('Paste storyline'); return; }
    workList.innerHTML = '';
    // split paragraphs -> frames
    const paras = text.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
    paras.forEach((p,idx)=>{
      const sentences = p.split(/(?<=[.!?])\s+/).filter(Boolean);
      const blocks = sentences.map((s,i)=>({id:null,label:`Block ${i+1}`,props:s}));
      // show a draft entry with Save button to persist a frame
      const draft = document.createElement('div'); draft.className='panel';
      draft.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center"><strong>Frame draft #${idx+1}</strong>
        <div><button class="btn" data-action="save">Save Frame</button></div></div>
        <div class="small" style="margin-top:8px">Background (editable):</div>
        <input type="text" class="bg-input" value="${p.slice(0,80)}">`;
      const blocksWrap = document.createElement('div'); blocksWrap.style.marginTop='8px';
      blocks.forEach(b=>blocksWrap.appendChild(makeBlockRow(b)));
      draft.appendChild(blocksWrap);
      draft.querySelector('[data-action="save"]').addEventListener('click', ()=>{
        // save frame to DB
        const background = draft.querySelector('.bg-input').value;
        const frameId = nextId('F');
        // assign IDs to blocks
        const withIds = blocks.map(b=>({ id: nextId('S'), label: b.label, props: b.props }));
        DB.frames.push({ id: frameId, background, blocks: withIds }); saveDB();
        alert(`Saved frame ${frameId}`); renderSavedFrames();
        draft.remove();
      });
      workList.appendChild(draft);
    });
  });

  function renderSavedFrames(){
    savedList.innerHTML = '';
    if(DB.frames.length===0){ savedList.innerHTML = '<div class="small">No saved frames</div>'; return; }
    DB.frames.forEach(f=>{
      const el = document.createElement('div'); el.className='item';
      el.innerHTML = `<div><div style="font-weight:700">${f.id}</div><div class="small">${(f.background||'').slice(0,50)}</div></div>
        <div><button class="btn" data-id="${f.id}" data-action="delete">Delete</button></div>`;
      savedList.appendChild(el);
    });
    $$('[data-action="delete"]', savedList).forEach(b=>b.addEventListener('click', e=>{ if(!confirm('Delete frame?')) return; DB.frames = DB.frames.filter(x=>x.id!==e.target.dataset.id); saveDB(); renderSavedFrames(); }));
  }

  renderSavedFrames();
}

/* ---------------------------
   PAGE LOADER logic
   --------------------------- */
let draftPage = { id:null, slots:[] }; // working page in memory

function initPageLoader(){
  const preset = $('#layout-preset'), newPageBtn = $('#new-page'), savePageBtn = $('#save-page'), board = $('#page-board');
  const slotList = $('#slot-list'), pagesSaved = $('#pages-saved');

  function newPage(){
    draftPage = { id:null, slots:[] }; board.innerHTML=''; slotList.innerHTML = '<div class="small">Choose a preset</div>';
  }

  function applyPreset(name){
    draftPage.slots = [];
    // simple percentage layout coordinates (x,y,width,height)
    if(name==='2-vertical'){
      draftPage.slots.push({ id: nextId('S'), x:2, y:2, w:46, h:96 });
      draftPage.slots.push({ id: nextId('S'), x:52, y:2, w:46, h:96 });
    } else if(name==='3-horizontal'){
      draftPage.slots.push({ id: nextId('S'), x:2, y:2, w:96, h:30 });
      draftPage.slots.push({ id: nextId('S'), x:2, y:34, w:96, h:30 });
      draftPage.slots.push({ id: nextId('S'), x:2, y:66, w:96, h:30 });
    } else if(name==='4-grid'){
      draftPage.slots.push({ id: nextId('S'), x:2, y:2, w:46, h:46 });
      draftPage.slots.push({ id: nextId('S'), x:52, y:2, w:46, h:46 });
      draftPage.slots.push({ id: nextId('S'), x:2, y:52, w:46, h:46 });
      draftPage.slots.push({ id: nextId('S'), x:52, y:52, w:46, h:46 });
    } else if(name==='1-focus-2'){
      draftPage.slots.push({ id: nextId('S'), x:2, y:2, w:96, h:60 });
      draftPage.slots.push({ id: nextId('S'), x:2, y:64, w:46, h:34 });
      draftPage.slots.push({ id: nextId('S'), x:52, y:64, w:46, h:34 });
    }
    renderBoard(); renderSlotList();
  }

  function renderBoard(){
    board.innerHTML=''; // create absolute positioned slots
    draftPage.slots.forEach(s=>{
      const el = document.createElement('div'); el.className='frame-slot';
      el.style.left = s.x + '%'; el.style.top = s.y + '%'; el.style.width = s.w + '%'; el.style.height = s.h + '%';
      el.innerHTML = `<div style="text-align:center"><div class="small">${s.id}</div><div style="margin-top:6px"><input data-slot="${s.id}" placeholder="Frame ID (e.g. F-0001)" style="width:100%;padding:4px;border-radius:6px;border:none;background:transparent;color:#fff"></div></div>`;
      board.appendChild(el);
      // wire input to set s.frameId on input event
      el.querySelector('input').addEventListener('input', (ev)=>{
        s.frameId = ev.target.value.trim();
        renderSlotList();
      });
    });
  }

  function renderSlotList(){
    slotList.innerHTML = '';
    if(draftPage.slots.length===0){ slotList.innerHTML = '<div class="small">No slots</div>'; return; }
    draftPage.slots.forEach((s,idx)=>{
      const el = document.createElement('div'); el.className='item';
      el.innerHTML = `<div><div style="font-weight:700">Slot ${idx+1}</div><div class="small">${s.id} ${s.frameId? ' • '+s.frameId : ' • not assigned'}</div></div>
        <div><button class="btn" data-id="${s.id}" data-action="assign">Assign</button></div>`;
      slotList.appendChild(el);
      el.querySelector('[data-action="assign"]').addEventListener('click', ()=>{
        const fid = prompt('Enter Frame ID to assign to this slot (e.g., F-0001)', s.frameId||''); if(!fid) return; s.frameId = fid.trim(); renderBoard(); renderSlotList();
      });
    });
  }

  function savePage(){
    // require frameIds to be set on each slot
    for(const s of draftPage.slots) if(!s.frameId){ alert('Assign a Frame ID to every slot before saving'); return; }
    const id = nextId('P');
    const toSave = { id, slots: JSON.parse(JSON.stringify(draftPage.slots)) };
    DB.pages.push(toSave); saveDB(); alert(`Saved page ${id}`); renderSavedPages(); newPage();
  }

  function renderSavedPages(){
    pagesSaved.innerHTML = '';
    if(DB.pages.length===0){ pagesSaved.innerHTML = '<div class="small">No saved pages</div>'; return; }
    DB.pages.forEach(p=>{
      const el = document.createElement('div'); el.className='item';
      el.innerHTML = `<div><div style="font-weight:700">${p.id}</div><div class="small">${p.slots.length} slot(s)</div></div>
        <div><button class="btn" data-id="${p.id}" data-action="delete">Delete</button></div>`;
      pagesSaved.appendChild(el);
    });
    $$('[data-action="delete"]', pagesSaved).forEach(b=>b.addEventListener('click', e=>{ if(!confirm('Delete page?')) return; DB.pages = DB.pages.filter(x=>x.id!==e.target.dataset.id); saveDB(); renderSavedPages(); }));
  }

  // wire up UI
  newPage(); renderSavedPages();
  preset.addEventListener('change', e=>applyPreset(e.target.value));
  newPageBtn.addEventListener('click', newPage);
  savePageBtn.addEventListener('click', savePage);
}

/* ---------------------------
   MANGA section logic
   --------------------------- */
function initManga(){
  const title = $('#book-title'), createBtn = $('#create-book'), bookList = $('#book-list');
  const currentBook = $('#current-book'), addPageId = $('#add-page-id'), addPageBtn = $('#add-page-to-book'), bookPages = $('#book-pages');
  const printBtn = $('#print-book'), exportBtn = $('#export-book');

  let currentBookId = null;

  function renderBooks(){
    bookList.innerHTML = '';
    if(DB.books.length===0) bookList.innerHTML = '<div class="small">No books yet</div>';
    DB.books.forEach(b=>{
      const el = document.createElement('div'); el.className='item';
      el.innerHTML = `<div><div style="font-weight:700">${b.title}</div><div class="small">${b.id} • ${b.pageIds.length} pages</div></div>
        <div><button class="btn" data-id="${b.id}" data-action="open">Open</button> <button class="btn" data-id="${b.id}" data-action="delete" style="background:${'#ef4444'}">Delete</button></div>`;
      bookList.appendChild(el);
    });
    $$('[data-action="open"]', bookList).forEach(b=>b.addEventListener('click', e=>{ currentBookId = e.target.dataset.id; updateCurrentBook(); }));
    $$('[data-action="delete"]', bookList).forEach(b=>b.addEventListener('click', e=>{ if(!confirm('Delete book?')) return; DB.books = DB.books.filter(x=>x.id!==e.target.dataset.id); saveDB(); renderBooks(); if(currentBookId===e.target.dataset.id){ currentBookId=null; updateCurrentBook(); } }));
  }

  function updateCurrentBook(){
    if(!currentBookId){ currentBook.textContent = 'None'; bookPages.innerHTML = ''; return; }
    const b = DB.books.find(x=>x.id===currentBookId); currentBook.textContent = `${b.title} (${b.id})`; renderBookPages();
  }

  createBtn.addEventListener('click', ()=>{
    const t = title.value.trim(); if(!t){ alert('Enter a title'); return; }
    const id = nextId('B'); DB.books.push({id,title:t,pageIds:[]}); saveDB(); title.value=''; renderBooks(); currentBookId = id; updateCurrentBook();
  });

  addPageBtn.addEventListener('click', ()=>{
    if(!currentBookId){ alert('Open a book first'); return; }
    const pid = addPageId.value.trim(); if(!pid){ alert('Enter page id'); return; }
    // verify page exists
    if(!DB.pages.find(p=>p.id===pid)){ alert('No such page id'); return; }
    const b = DB.books.find(x=>x.id===currentBookId);
    b.pageIds.push(pid); saveDB(); addPageId.value=''; renderBookPages();
  });

  function renderBookPages(){
    bookPages.innerHTML = '';
    if(!currentBookId) return;
    const b = DB.books.find(x=>x.id===currentBookId);
    if(b.pageIds.length===0) bookPages.innerHTML = '<div class="small">No pages</div>';
    b.pageIds.forEach((pid, idx)=>{
      const el = document.createElement('div'); el.className='item';
      el.innerHTML = `<div><div style="font-weight:700">#${idx+1}</div><div class="small">${pid}</div></div>
        <div><button class="btn" data-idx="${idx}" data-action="up">↑</button> <button class="btn" data-idx="${idx}" data-action="down">↓</button> <button class="btn" data-idx="${idx}" data-action="del" style="background:${'#ef4444'}">Remove</button></div>`;
      bookPages.appendChild(el);
    });
    $$('[data-action="up"]', bookPages).forEach(b=>b.addEventListener('click', e=>{ const i=Number(e.target.dataset.idx); if(i>0){ const bk = DB.books.find(x=>x.id===currentBookId); [bk.pageIds[i-1],bk.pageIds[i]]=[bk.pageIds[i],bk.pageIds[i-1]]; saveDB(); renderBookPages(); } }));
    $$('[data-action="down"]', bookPages).forEach(b=>b.addEventListener('click', e=>{ const i=Number(e.target.dataset.idx); const bk = DB.books.find(x=>x.id===currentBookId); if(i < bk.pageIds.length-1){ [bk.pageIds[i+1],bk.pageIds[i]]=[bk.pageIds[i],bk.pageIds[i+1]]; saveDB(); renderBookPages(); } }));
    $$('[data-action="del"]', bookPages).forEach(b=>b.addEventListener('click', e=>{ const i=Number(e.target.dataset.idx); const bk = DB.books.find(x=>x.id===currentBookId); bk.pageIds.splice(i,1); saveDB(); renderBookPages(); }));
  }

  printBtn.addEventListener('click', ()=>{ window.print(); });
  exportBtn.addEventListener('click', ()=>{
    if(!currentBookId){ alert('Open a book first'); return; }
    const b = DB.books.find(x=>x.id===currentBookId);
    const blob = new Blob([JSON.stringify(b,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download=`${b.title.replace(/[^\w]+/g,'_')}_${b.id}.json`; a.click(); URL.revokeObjectURL(url);
  });

  renderBooks(); updateCurrentBook();
}

/* ---------------------------
   Global UI: export / import entire workspace
   --------------------------- */
function initGlobalExportImport(){
  // For simplicity: place a quick listener on any element with id export-work to export workspace
  const ex = $('#export-work');
  if(ex){ ex.addEventListener('click', ()=>{
    const blob = new Blob([JSON.stringify({DB,COUNTERS},null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href=url; a.download='manga_workspace.json'; a.click(); URL.revokeObjectURL(url);
  }) }
}

/* ---------------------------
   Boot: run page-specific init based on <body data-page="...">
   --------------------------- */
function boot(){
  const page = document.body.dataset.page;
  if(!page) return;
  initGlobalExportImport();
  if(page === 'home') initHome();
  else if(page === 'character') initCharacter();
  else if(page === 'object') initObject();
  else if(page === 'plotter') initPlotter();
  else if(page === 'page_loader') initPageLoader();
  else if(page === 'manga') initManga();
}

/* Run on DOM ready */
document.addEventListener('DOMContentLoaded', boot);
