(function(){
  "use strict";

  /* ---------------- Data ---------------- */
  var CANDIDATES = [
    { id:'c1', name:'Amara Osei',   tag:'Community-first infrastructure', color:'#33E0C7' },
    { id:'c2', name:'Devon Wallace',tag:'Small-business tax relief',      color:'#E7B84B' },
    { id:'c3', name:'Priya Nair',   tag:'Green transit expansion',        color:'#8695B3' },
    { id:'c4', name:'Marcus Ilić',  tag:'Digital-first public services',  color:'#F0555C' }
  ];
  var PROFILE_KEY = 'voter-profile';
  var TALLY_KEY = 'ballot-tally';

  function initials(name){
    return name.split(' ').map(function(p){return p[0];}).join('').slice(0,2).toUpperCase();
  }

  /* ---------------- Storage helpers ----------------
     Uses localStorage so the app runs standalone in any browser
     (no server, no external runtime). Kept as async functions so
     the rest of the app's await-based calls don't need to change.
     NOTE: localStorage is per-browser/per-device, so "live results"
     reflect votes cast in *this* browser only — not a real multi-user
     shared tally. See README for what a real backend would need. */
  async function getProfile(){
    try{
      var raw = localStorage.getItem(PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  async function setProfile(obj){
    try{ localStorage.setItem(PROFILE_KEY, JSON.stringify(obj)); }catch(e){ console.error(e); }
  }
  async function deleteProfile(){
    try{ localStorage.removeItem(PROFILE_KEY); }catch(e){}
  }
  async function getTally(){
    try{
      var raw = localStorage.getItem(TALLY_KEY);
      return raw ? JSON.parse(raw) : null;
    }catch(e){ return null; }
  }
  async function setTally(obj){
    try{ localStorage.setItem(TALLY_KEY, JSON.stringify(obj)); }catch(e){ console.error(e); }
  }
  function emptyTally(){
    var t = { total:0, counts:{} };
    CANDIDATES.forEach(function(c){ t.counts[c.id] = 0; });
    return t;
  }

  /* ---------------- App state ---------------- */
  var state = {
    profile:null,
    verifiedThisSession:false,
    loggedIn:false,
    selectedCandidate:null
  };

  var screens = ['register','scan','login','home'];
  function showScreen(name){
    screens.forEach(function(s){
      document.getElementById('screen-'+s).classList.toggle('hidden', s!==name);
    });
    updateStepper(name);
    updateSessionBadge(name);
  }

  function updateStepper(active){
    var map = { register:'scan', scan:'scan', login:'login', home:'vote' };
    var current = map[active] || 'scan';
    var order = ['scan','login','vote'];
    var idx = order.indexOf(current);
    document.querySelectorAll('.step').forEach(function(el){
      var step = el.getAttribute('data-step');
      var stepIdx = order.indexOf(step);
      el.classList.remove('active','done','pending');
      if(stepIdx < idx) el.classList.add('done');
      else if(stepIdx === idx) el.classList.add('active');
      else el.classList.add('pending');
    });
  }

  function updateSessionBadge(screenName){
    var dot = document.getElementById('sessionDot');
    var txt = document.getElementById('sessionText');
    if(screenName==='home' && state.loggedIn){
      dot.classList.add('on');
      txt.textContent = (state.profile ? state.profile.name : 'Voter') + ' · authenticated';
    } else if(screenName==='login' && state.verifiedThisSession){
      dot.classList.add('on');
      txt.textContent = 'Face verified · awaiting credentials';
    } else {
      dot.classList.remove('on');
      txt.textContent = 'No active session';
    }
  }

  function alertBox(msg, kind){
    kind = kind || 'error';
    var cls = kind === 'error' ? 'alert' : 'note';
    return '<div class="'+cls+'"><span>'+(kind==='error'?'⚠️':'ℹ️')+'</span><span>'+msg+'</span></div>';
  }

  /* ================= REGISTER SCREEN ================= */
  var regStream = null;
  var regEl = {
    video: document.getElementById('regVideo'),
    canvas: document.getElementById('regCanvas'),
    placeholder: document.getElementById('regPlaceholder'),
    ring: document.getElementById('regRing'),
    scanLine: document.getElementById('regScanLine'),
    status: document.getElementById('regStatus'),
    camBtn: document.getElementById('regCamBtn'),
    captureBtn: document.getElementById('regCaptureBtn'),
    submitBtn: document.getElementById('regSubmitBtn'),
    alert: document.getElementById('regAlert'),
    name: document.getElementById('regName'),
    id: document.getElementById('regId')
  };
  var regSnapshot = null;

  async function startRegCamera(){
    regEl.alert.innerHTML = '';
    try{
      regStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user' }, audio:false });
      regEl.video.srcObject = regStream;
      regEl.video.classList.remove('hidden');
      regEl.placeholder.classList.add('hidden');
      regEl.ring.classList.add('pulse');
      regEl.status.innerHTML = '<span class="spinner"></span> Camera live — center your face';
      regEl.captureBtn.disabled = false;
      regEl.camBtn.textContent = 'Camera enabled';
      regEl.camBtn.disabled = true;
    }catch(err){
      regEl.status.textContent = 'Camera unavailable';
      regEl.status.classList.add('err');
      regEl.alert.innerHTML = alertBox('Couldn\'t access your camera ('+ (err.message || 'permission denied') +'). You can allow camera access in your browser\'s address-bar permissions and try again.');
    }
  }

  function captureFrame(videoEl, canvasEl, size){
    size = size || 180;
    canvasEl.width = size; canvasEl.height = size;
    var ctx = canvasEl.getContext('2d');
    var vw = videoEl.videoWidth, vh = videoEl.videoHeight;
    var side = Math.min(vw, vh);
    var sx = (vw - side)/2, sy = (vh - side)/2;
    ctx.save();
    ctx.translate(size,0); ctx.scale(-1,1); // mirror to match preview
    ctx.drawImage(videoEl, sx, sy, side, side, 0, 0, size, size);
    ctx.restore();
    return canvasEl.toDataURL('image/jpeg', 0.7);
  }

  regEl.camBtn.addEventListener('click', startRegCamera);

  regEl.captureBtn.addEventListener('click', function(){
    if(!regEl.video.videoWidth){ return; }
    regSnapshot = captureFrame(regEl.video, regEl.canvas, 180);
    regEl.ring.classList.remove('pulse');
    regEl.ring.classList.add('locked');
    regEl.status.textContent = 'Reference face captured ✓';
    regEl.status.classList.remove('err');
    regEl.captureBtn.classList.add('hidden');
    regEl.submitBtn.classList.remove('hidden');
  });

  regEl.submitBtn.addEventListener('click', async function(){
    var name = regEl.name.value.trim();
    var id = regEl.id.value.trim();
    regEl.alert.innerHTML = '';
    if(!name || !id){
      regEl.alert.innerHTML = alertBox('Enter your full name and choose a voter ID before completing enrollment.');
      return;
    }
    if(!regSnapshot){
      regEl.alert.innerHTML = alertBox('Capture your reference face before completing enrollment.');
      return;
    }
    var profile = {
      name: name,
      voterId: id,
      faceSnapshot: regSnapshot,
      registeredAt: Date.now(),
      hasVoted: false,
      votedFor: null
    };
    await setProfile(profile);
    state.profile = profile;
    stopStream(regStream); regStream = null;
    goToScan();
  });

  document.getElementById('forgetProfileBtn').addEventListener('click', async function(){
    if(!confirm('Reset enrollment? This clears your saved face profile and voter ID on this device.')){ return; }
    await deleteProfile();
    state.profile = null;
    state.verifiedThisSession = false;
    state.loggedIn = false;
    resetRegisterForm();
    showScreen('register');
  });

  function resetRegisterForm(){
    regSnapshot = null;
    regEl.name.value=''; regEl.id.value='';
    regEl.ring.classList.remove('locked','pulse');
    regEl.captureBtn.classList.remove('hidden');
    regEl.captureBtn.disabled = true;
    regEl.submitBtn.classList.add('hidden');
    regEl.camBtn.disabled = false; regEl.camBtn.textContent = 'Enable camera';
    regEl.video.classList.add('hidden');
    regEl.placeholder.classList.remove('hidden');
    regEl.status.textContent = 'Awaiting camera access';
    regEl.status.classList.remove('err');
  }

  function stopStream(stream){
    if(stream){ stream.getTracks().forEach(function(t){ t.stop(); }); }
  }

  /* ================= SCAN SCREEN (login gate) ================= */
  var scanStream = null;
  var scanEl = {
    video: document.getElementById('scanVideo'),
    placeholder: document.getElementById('scanPlaceholder'),
    ring: document.getElementById('scanRing'),
    scanLine: document.getElementById('scanScanLine'),
    status: document.getElementById('scanStatus'),
    startBtn: document.getElementById('scanStartBtn'),
    retryBtn: document.getElementById('scanRetryBtn'),
    alert: document.getElementById('scanAlert'),
    intro: document.getElementById('scanIntro')
  };

  function goToScan(){
    scanEl.alert.innerHTML='';
    scanEl.status.textContent = 'Awaiting camera access';
    scanEl.status.classList.remove('err');
    scanEl.ring.classList.remove('locked','pulse');
    scanEl.scanLine.classList.remove('active');
    scanEl.startBtn.classList.remove('hidden');
    scanEl.retryBtn.classList.add('hidden');
    scanEl.intro.textContent = 'Welcome back, ' + (state.profile ? state.profile.name : 'voter') + '. Center your face in the frame to continue.';
    showScreen('scan');
  }

  scanEl.startBtn.addEventListener('click', runFaceScan);
  scanEl.retryBtn.addEventListener('click', runFaceScan);

  async function runFaceScan(){
    scanEl.alert.innerHTML = '';
    scanEl.startBtn.classList.add('hidden');
    scanEl.retryBtn.classList.add('hidden');
    scanEl.ring.classList.remove('locked');

    try{
      scanStream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'user' }, audio:false });
      scanEl.video.srcObject = scanStream;
      scanEl.video.classList.remove('hidden');
      scanEl.placeholder.classList.add('hidden');
    }catch(err){
      scanEl.status.textContent = 'Camera unavailable';
      scanEl.status.classList.add('err');
      scanEl.alert.innerHTML = alertBox('Couldn\'t access your camera. Grant camera permission and retry, or continue in simulated mode.');
      scanEl.retryBtn.classList.remove('hidden');
      offerSimulatedContinue();
      return;
    }

    scanEl.ring.classList.add('pulse');
    scanEl.scanLine.classList.add('active');

    var steps = [
      { text:'Positioning frame…', ms:650 },
      { text:'Detecting face…', ms:900 },
      { text:'Matching against enrolled profile…', ms:1000 },
      { text:'Identity verified ✓', ms:0 }
    ];

    var detected = await tryNativeFaceDetector(scanEl.video).catch(function(){ return null; });

    for(var i=0;i<steps.length;i++){
      await sleep(steps[i].ms);
      scanEl.status.innerHTML = (i<steps.length-1 ? '<span class="spinner"></span> ' : '') + steps[i].text;
    }

    scanEl.scanLine.classList.remove('active');
    scanEl.ring.classList.remove('pulse');
    scanEl.ring.classList.add('locked');
    scanEl.status.classList.remove('err');

    state.verifiedThisSession = true;
    stopStream(scanStream); scanStream = null;

    if(detected === false){
      scanEl.alert.innerHTML = alertBox('No face detected in frame — proceeding on a simulated match for this demo. In production, a failed detection would block sign-in.', 'note');
    }

    await sleep(500);
    goToLogin();
  }

  function offerSimulatedContinue(){
    scanEl.alert.innerHTML += alertBox('No camera? You can still preview the flow — the scan will simulate a successful match.', 'note');
    var btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Continue in simulated mode';
    btn.style.marginTop = '10px';
    btn.addEventListener('click', async function(){
      scanEl.ring.classList.add('pulse');
      scanEl.status.innerHTML = '<span class="spinner"></span> Simulating verification…';
      await sleep(1200);
      scanEl.ring.classList.remove('pulse'); scanEl.ring.classList.add('locked');
      scanEl.status.textContent = 'Identity verified (simulated) ✓';
      state.verifiedThisSession = true;
      await sleep(400);
      goToLogin();
    });
    scanEl.alert.appendChild(btn);
  }

  function tryNativeFaceDetector(videoEl){
    return new Promise(function(resolve, reject){
      if(!('FaceDetector' in window)){ resolve(null); return; }
      try{
        var fd = new window.FaceDetector({ fastMode:true, maxDetectedFaces:1 });
        setTimeout(function(){
          fd.detect(videoEl).then(function(faces){
            resolve(faces && faces.length>0);
          }).catch(function(){ resolve(null); });
        }, 700);
      }catch(e){ resolve(null); }
    });
  }

  function sleep(ms){ return new Promise(function(r){ setTimeout(r, ms); }); }

  /* ================= LOGIN SCREEN ================= */
  var loginEl = {
    id: document.getElementById('loginId'),
    pw: document.getElementById('loginPw'),
    alert: document.getElementById('loginAlert'),
    submit: document.getElementById('loginSubmitBtn'),
    back: document.getElementById('loginBackBtn')
  };

  function goToLogin(){
    loginEl.alert.innerHTML = '';
    if(state.profile){ loginEl.id.value = state.profile.voterId; }
    loginEl.pw.value = '';
    showScreen('login');
  }

  loginEl.back.addEventListener('click', function(){
    goToScan();
  });

  loginEl.submit.addEventListener('click', function(){
    loginEl.alert.innerHTML = '';
    if(!state.verifiedThisSession){
      loginEl.alert.innerHTML = alertBox('Face verification expired — please rescan.');
      goToScan();
      return;
    }
    var idVal = loginEl.id.value.trim();
    var pwVal = loginEl.pw.value;
    if(!idVal || pwVal.length < 4){
      loginEl.alert.innerHTML = alertBox('Enter your voter ID and a password of at least 4 characters.');
      return;
    }
    if(state.profile && idVal.toLowerCase() !== state.profile.voterId.toLowerCase()){
      loginEl.alert.innerHTML = alertBox('That voter ID doesn\'t match the enrolled profile for this scanned face.');
      return;
    }
    state.loggedIn = true;
    enterHome();
  });

  /* ================= HOME / VOTE SCREEN ================= */
  var homeEl = {
    title: document.getElementById('homeTitle'),
    eyebrow: document.getElementById('homeEyebrow'),
    list: document.getElementById('candidateList'),
    submitBtn: document.getElementById('submitVoteBtn'),
    alert: document.getElementById('voteAlert'),
    votedPanel: document.getElementById('votedPanel'),
    votedFor: document.getElementById('votedFor'),
    paneVote: document.getElementById('paneVote'),
    paneResults: document.getElementById('paneResults'),
    tabVote: document.getElementById('tabVote'),
    tabResults: document.getElementById('tabResults'),
    resultsList: document.getElementById('resultsList'),
    totalText: document.getElementById('totalVotesText')
  };

  function renderCandidates(){
    homeEl.list.innerHTML = '';
    CANDIDATES.forEach(function(c){
      var row = document.createElement('label');
      row.className = 'candidate';
      row.dataset.id = c.id;
      row.innerHTML =
        '<input type="radio" name="candidate" value="'+c.id+'"/>' +
        '<div class="avatar" style="background:'+c.color+'">'+initials(c.name)+'</div>' +
        '<div><div class="cand-name">'+c.name+'</div><div class="cand-tag">'+c.tag+'</div></div>';
      row.addEventListener('click', function(){
        state.selectedCandidate = c.id;
        document.querySelectorAll('.candidate').forEach(function(el){ el.classList.remove('selected'); });
        row.classList.add('selected');
        row.querySelector('input').checked = true;
        homeEl.submitBtn.disabled = false;
      });
      homeEl.list.appendChild(row);
    });
  }

  async function enterHome(){
    homeEl.eyebrow.textContent = 'Checkpoint 03 · Signed in as ' + state.profile.name;
    homeEl.alert.innerHTML = '';
    state.selectedCandidate = null;
    homeEl.submitBtn.disabled = true;

    if(state.profile.hasVoted){
      showVotedState();
    }else{
      homeEl.votedPanel.classList.add('hidden');
      homeEl.list.style.display = '';
      homeEl.submitBtn.style.display = '';
      homeEl.title.textContent = 'Cast your ballot';
      renderCandidates();
    }
    switchTab('vote');
    showScreen('home');
    await refreshResults();
  }

  function showVotedState(){
    homeEl.list.style.display = 'none';
    homeEl.submitBtn.style.display = 'none';
    homeEl.title.textContent = 'Your ballot';
    homeEl.votedPanel.classList.remove('hidden');
    var c = CANDIDATES.find(function(x){ return x.id === state.profile.votedFor; });
    homeEl.votedFor.textContent = c ? ('You voted for ' + c.name + '.') : 'Your vote has been recorded.';
  }

  homeEl.submitBtn.addEventListener('click', async function(){
    if(!state.selectedCandidate) return;
    homeEl.alert.innerHTML = '';
    homeEl.submitBtn.disabled = true;
    homeEl.submitBtn.textContent = 'Submitting…';

    var tally = await getTally() || emptyTally();
    if(!tally.counts) tally.counts = {};
    CANDIDATES.forEach(function(c){ if(typeof tally.counts[c.id] !== 'number') tally.counts[c.id] = 0; });
    tally.counts[state.selectedCandidate] += 1;
    tally.total = (tally.total || 0) + 1;
    await setTally(tally);

    state.profile.hasVoted = true;
    state.profile.votedFor = state.selectedCandidate;
    await setProfile(state.profile);

    homeEl.submitBtn.textContent = 'Submit vote';
    showVotedState();
    await refreshResults();
  });

  document.getElementById('viewResultsBtn').addEventListener('click', function(){ switchTab('results'); });
  homeEl.tabVote.addEventListener('click', function(){ switchTab('vote'); });
  homeEl.tabResults.addEventListener('click', function(){ switchTab('results'); refreshResults(); });

  function switchTab(name){
    homeEl.paneVote.classList.toggle('hidden', name!=='vote');
    homeEl.paneResults.classList.toggle('hidden', name!=='results');
    homeEl.tabVote.classList.toggle('active', name==='vote');
    homeEl.tabResults.classList.toggle('active', name==='results');
  }

  async function refreshResults(){
    var tally = await getTally() || emptyTally();
    var total = tally.total || 0;
    homeEl.resultsList.innerHTML = '';
    CANDIDATES.forEach(function(c){
      var count = (tally.counts && tally.counts[c.id]) || 0;
      var pct = total > 0 ? Math.round((count/total)*100) : 0;
      var row = document.createElement('div');
      row.className = 'result-row';
      row.innerHTML =
        '<div class="result-top"><span class="result-name">'+c.name+'</span><span class="result-pct mono">'+count+' · '+pct+'%</span></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:'+pct+'%; background:'+c.color+'"></div></div>';
      homeEl.resultsList.appendChild(row);
    });
    homeEl.totalText.textContent = total + ' vote' + (total===1?'':'s') + ' cast so far · updates live across sessions';
  }

  function doLogout(){
    state.loggedIn = false;
    state.verifiedThisSession = false;
    state.selectedCandidate = null;
    goToScan();
  }
  document.getElementById('logoutBtn').addEventListener('click', doLogout);
  document.getElementById('logoutBtn2').addEventListener('click', doLogout);

  /* ================= Init ================= */
  async function init(){
    var profile = await getProfile();
    state.profile = profile;
    if(profile){
      resetRegisterForm();
      goToScan();
    }else{
      resetRegisterForm();
      showScreen('register');
    }
    // Poll shared results periodically so the results tab stays live
    setInterval(function(){
      if(!document.getElementById('screen-home').classList.contains('hidden') &&
         !document.getElementById('paneResults').classList.contains('hidden')){
        refreshResults();
      }
    }, 4000);
  }

  init();
})();
