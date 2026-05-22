// homepage-content-fix.js
// Fixes saveHomepageContent skipping empty fields (original uses `about && ...`
// so clearing a textarea and saving does nothing). Patches the function so empty
// values are always written, allowing proper clearing of content.

(function () {

  async function upsertSettingV9(key, value) {
    var fs = await import('https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js');
    var db = fs.getFirestore(window._firebaseApp);
    var q  = fs.query(fs.collection(db, 'settings'), fs.where('key', '==', key));
    var snap = await fs.getDocs(q);
    if (snap.empty) {
      await fs.addDoc(fs.collection(db, 'settings'), { key: key, value: value, updatedAt: new Date().toISOString() });
    } else {
      await fs.updateDoc(fs.doc(db, 'settings', snap.docs[0].id), { value: value, updatedAt: new Date().toISOString() });
    }
  }

  function patchSaveHomepageContent() {
    if (typeof window.saveHomepageContent !== 'function') {
      setTimeout(patchSaveHomepageContent, 100);
      return;
    }

    window.saveHomepageContent = async function () {
      var get = function (id) { return (document.getElementById(id)?.value || '').trim(); };
      var btn = document.querySelector('#a-homepage .btn-primary');
      if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...'; }

      try {
        // Always write all fields — even empty strings — so clearing actually clears
        await Promise.all([
          upsertSettingV9('about',        get('hp-about')),
          upsertSettingV9('mission',      get('hp-mission')),
          upsertSettingV9('vision',       get('hp-vision')),
          upsertSettingV9('parentsNote',  get('hp-parents')),
          upsertSettingV9('admissionLink',get('hp-apply-link')),
        ]);
        window.loadDynamicHomepageContent && window.loadDynamicHomepageContent();
        window.showToast && window.showToast('✅ Homepage content saved and updated live!');
      } catch (e) {
        window.showToast && window.showToast('❌ Save failed: ' + e.message);
      } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-save"></i> Save All Changes'; }
      }
    };
  }

  patchSaveHomepageContent();

})();
