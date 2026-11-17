// DOM HUD: health, ammo, compass, timer, sentries, kill feed, banners and
// the start / pause / end screens.
export class Hud {
  constructor() {
    this.el = (id) => document.getElementById(id);
    this.hud = this.el('hud');
    this.healthNum = this.el('healthNum');
    this.healthBar = this.el('healthBar');
    this.magAmmo = this.el('magAmmo');
    this.resAmmo = this.el('resAmmo');
    this.sentriesLeft = this.el('sentriesLeft');
    this.timer = this.el('timer');
    this.kills = this.el('kills');
    this.feed = this.el('feed');
    this.banner = this.el('banner');
    this.bannerBig = this.banner.querySelector('.big');
    this.bannerSub = this.banner.querySelector('.sub');
    this.hitmarker = this.el('hitmarker');
    this.crosshair = this.el('crosshair');
    this.compassStrip = this.el('compassStrip');
    this.damage = this.el('damage');
    this.flash = this.el('flash');
    this.objective = this.el('objective');
    this.hint = this.el('hint');
    this.bannerTimer = 0;
    this.hitTimer = 0;
    this.comboVal = this.el('comboVal');
    this.scoreVal = this.el('scoreVal');
    this.waveVal = this.el('waveVal');
    this.fireMode = this.el('fireMode');
  }

  showHud(v) { this.hud.classList.toggle('hidden', !v); }
  showStart(v) { this.el('screen-start').classList.toggle('hidden', !v); }
  showPause(v) { this.el('screen-pause').classList.toggle('hidden', !v); }
  setEndVisible(v) { this.el('screen-end').classList.toggle('hidden', !v); }

  fmtTime(sec) {
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  update(state) {
    this.healthNum.textContent = Math.ceil(state.hp);
    this.healthBar.style.width = `${Math.max(0, state.hp)}%`;
    this.healthBar.style.background = state.hp > 50 ? '#7dc383' : state.hp > 25 ? '#e8a33d' : '#e5484d';
    this.magAmmo.textContent = state.mag;
    this.resAmmo.textContent = state.reserve;
    this.sentriesLeft.textContent = state.left;
    this.kills.textContent = state.kills;
    this.timer.textContent = this.fmtTime(state.time);
    this.comboVal.textContent = state.combo > 0 ? `x${state.combo}` : '—';
    this.scoreVal.textContent = state.score;
    this.waveVal.textContent = `${state.wave}/3`;
    this.fireMode.textContent = state.upgraded ? 'CARBINE · AUTO · EXT MAG' : 'CARBINE · AUTO';
    this.objective.textContent = state.captainAlive
      ? '⚠ CAPTAIN VOSS IS HUNTING YOU'
      : state.left > 0
        ? `CLEAR THE OUTPOST — ${state.left} SENTR${state.left === 1 ? 'Y' : 'IES'} REMAIN`
        : 'OUTPOST CLEAR';
    // Crosshair spread.
    const spread = 4 + state.spread * 900;
    this.crosshair.style.transform = `translate(-50%,-50%) scale(${1 + state.spread * 14})`;
    this.crosshair.style.opacity = state.ads ? 0.35 : 1;
    // Compass: 120-degree window centred on heading.
    const deg = ((-state.yaw * 180) / Math.PI % 360 + 360) % 360;
    const labels = [[0, 'N'], [45, 'NE'], [90, 'E'], [135, 'SE'], [180, 'S'], [225, 'SW'], [270, 'W'], [315, 'NW']];
    let html = '';
    for (let off = -60; off <= 60; off += 5) {
      const h = (deg + off + 360) % 360;
      const x = 170 + off * 2.6;
      let mark = '';
      for (const [d, name] of labels) {
        if (Math.abs(((h - d + 540) % 360) - 180) < 2.5) mark = `<b>${name}</b>`;
      }
      if (off % 15 === 0) mark = mark || '·';
      html += `<span style="position:absolute;left:${x}px;top:4px">${mark}</span>`;
    }
    if (state.nearestBearing != null) {
      const rel = ((state.nearestBearing - deg + 540) % 360) - 180;
      if (Math.abs(rel) <= 55) {
        html += `<span class="mk" style="position:absolute;left:${170 + rel * 2.6}px;top:13px">▼ ${state.nearestDist}m</span>`;
      }
    }
    this.compassStrip.innerHTML = html;
    // Timers.
    if (this.bannerTimer > 0) {
      this.bannerTimer -= state.dt;
      if (this.bannerTimer <= 0) this.banner.classList.add('hidden');
    }
    if (this.hitTimer > 0) {
      this.hitTimer -= state.dt;
      if (this.hitTimer <= 0) this.hitmarker.style.opacity = 0;
    }
    if (state.damageFlash > 0) {
      this.damage.style.opacity = Math.min(1, state.damageFlash);
    } else {
      this.damage.style.opacity = 0;
    }
    if (state.lightningFlash > 0) this.flash.style.opacity = state.lightningFlash * 0.35;
    else this.flash.style.opacity = 0;
  }

  bannerText(big, sub, seconds = 2.4) {
    this.bannerBig.textContent = big;
    this.bannerSub.textContent = sub;
    this.banner.classList.remove('hidden');
    this.bannerTimer = seconds;
  }

  showHit(head) {
    this.hitmarker.classList.toggle('headshot', !!head);
    this.hitmarker.style.opacity = 1;
    this.hitTimer = 0.14;
  }

  feedLine(text, color = '#dfe7ef') {
    const div = document.createElement('div');
    div.textContent = text;
    div.style.color = color;
    this.feed.prepend(div);
    while (this.feed.children.length > 5) this.feed.removeChild(this.feed.lastChild);
    setTimeout(() => { if (div.parentNode) div.remove(); }, 6000);
  }

  showEnd(win, stats) {
    const card = document.getElementById('endCard');
    card.classList.toggle('win', win);
    card.classList.toggle('lose', !win);
    document.getElementById('endTitle').textContent = win ? 'MISSION COMPLETE' : 'MISSION FAILED';
    document.getElementById('endText').textContent = win
      ? `All eight sentries are down. The outpost is silent — only the rain keeps watch. Final score ${stats.score}.`
      : 'You were cut down in the rain. The outpost still stands. Try a different approach.';
    document.getElementById('statTime').textContent = this.fmtTime(stats.time);
    document.getElementById('statKills').textContent = `${stats.kills}/8`;
    document.getElementById('statAcc').textContent = `${stats.accuracy}%`;
    document.getElementById('statShots').textContent = stats.shots;
    document.getElementById('statScore').textContent = stats.score;
    document.getElementById('statCombo').textContent = `x${stats.bestCombo}`;
    this.setEndVisible(true);
  }
}
