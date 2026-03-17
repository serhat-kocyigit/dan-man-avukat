/**
 * ══════════════════════════════════════════════════════════
 *  HakPortal — 3D Avatar Viewer (Three.js + Ready Player Me)
 *  avatar3d.js  |  v1.0
 *
 *  Akış:
 *   1. Kullanıcı "3D Avatar Oluştur" butonuna basar
 *   2. Ready Player Me embed iframe açılır
 *   3. Kullanıcı avatar tasarlar → RPM .glb URL gönderir (postMessage)
 *   4. URL backend'e kaydedilir
 *   5. Three.js ile avatar panel'de boydan gösterilir
 * ══════════════════════════════════════════════════════════
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.166.1/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/controls/OrbitControls.js';

// ── RPM Konfigürasyonu (Mükemmelleştirilmiş) ────────────────
const RPM_SUBDOMAIN = 'demo';

// UI Kısıtlamaları ve Hız Parametreleri:
// - clearCache: Her seferinde temiz başlar
// - bodyType=fullbody: Sadece boydan
// - quality=low/medium: Yükleme hızını artırır (low bile web için çok iyidir)
// - meshLod=1: Poligon sayısını optimize eder (HIZ İÇİN KRİTİK)
// - textureSizeLimit=1024: Dokuları küçültür (RAM VE HIZ İÇİN KRİTİK)
const RPM_EMBED_URL = `https://${RPM_SUBDOMAIN}.readyplayer.me/avatar?frameApi&source=hakportal&clearCache&bodyType=fullbody&quality=medium&meshLod=1&textureSizeLimit=1024&language=tr&textureEncoding=sRGB`;

/* ────────────────────────────────────────────────────────── */
/*  3D SAHNE                                                   */
/* ────────────────────────────────────────────────────────── */

class AvatarViewer3D {
    constructor(canvasEl) {
        this.canvas = canvasEl;
        this.mixer = null;
        this.clock = new THREE.Clock();
        this.avatar = null;
        this._raf = null;
        this._init();
    }

    _init() {
        const w = this.canvas.clientWidth || 300;
        const h = this.canvas.clientHeight || 450;

        /* Renderer */
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setSize(w, h);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.2;

        /* Sahne */
        this.scene = new THREE.Scene();

        /* Kamera — boydan görünüm */
        this.camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
        this.camera.position.set(0, 1.0, 3.2);
        this.camera.lookAt(0, 0.9, 0);

        /* Işıklar */
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);

        const key = new THREE.DirectionalLight(0xfff5e0, 1.8);
        key.position.set(2, 4, 3);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        this.scene.add(key);

        const fill = new THREE.DirectionalLight(0xcce4ff, 0.6);
        fill.position.set(-2, 2, -2);
        this.scene.add(fill);

        const rim = new THREE.DirectionalLight(0xffffff, 0.8);
        rim.position.set(0, 3, -4);
        this.scene.add(rim);

        /* Zemin gölgesi */
        const shadowGeo = new THREE.CircleGeometry(0.6, 32);
        const shadowMat = new THREE.MeshBasicMaterial({
            color: 0x000000, transparent: true, opacity: 0.18, depthWrite: false
        });
        const shadow = new THREE.Mesh(shadowGeo, shadowMat);
        shadow.rotation.x = -Math.PI / 2;
        shadow.position.y = -0.001;
        this.scene.add(shadow);

        /* Orbit kontrolleri (dokunmatik + fare) */
        this.controls = new OrbitControls(this.camera, this.canvas);
        this.controls.target.set(0, 0.9, 0);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 1.2;
        this.controls.maxDistance = 5;
        this.controls.minPolarAngle = Math.PI * 0.1;
        this.controls.maxPolarAngle = Math.PI * 0.85;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.6;

        /* Resize */
        const ro = new ResizeObserver(() => this._onResize());
        ro.observe(this.canvas.parentElement || this.canvas);

        /* Render döngüsü */
        this._animate();
    }

    _onResize() {
        const el = this.canvas.parentElement || this.canvas;
        const w = el.clientWidth;
        const h = el.clientHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    _animate() {
        this._raf = requestAnimationFrame(() => this._animate());
        const dt = this.clock.getDelta();
        this.mixer?.update(dt);
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /** GLB URL → sahneye yükle */
    async loadAvatar(glbUrl) {
        if (this.avatar) {
            this.scene.remove(this.avatar);
            this.mixer = null;
        }
        this._showLoading(true);

        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.166.1/examples/jsm/libs/draco/');

        const loader = new GLTFLoader();
        loader.setDRACOLoader(dracoLoader);

        try {
            // 🚀 HIZ OPTİMİZASYONU: LOD-1 ve 1024 texture limit zorluyoruz
            const baseUrl = glbUrl.split('?')[0];
            const optimizedUrl = `${baseUrl}?meshLod=1&textureSizeLimit=1024&textureEncoding=sRGB&morphTargets=ARKit`;

            const gltf = await loader.loadAsync(optimizedUrl);

            this.avatar = gltf.scene;
            this.avatar.traverse(obj => {
                if (obj.isMesh) {
                    obj.castShadow = true;
                    obj.receiveShadow = true;
                    if (obj.material) obj.material.envMapIntensity = 1.0;
                }
            });

            const box = new THREE.Box3().setFromObject(this.avatar);
            const height = box.max.y - box.min.y;
            this.avatar.position.y -= box.min.y;

            this.scene.add(this.avatar);

            const mid = (box.max.y - box.min.y) / 2;
            this.controls.target.set(0, mid, 0);
            this.camera.position.set(0, mid + 0.2, height * 1.6);

            if (gltf.animations?.length) {
                this.mixer = new THREE.AnimationMixer(this.avatar);
                const idle = gltf.animations.find(a => /idle|stand|breathing/i.test(a.name)) || gltf.animations[0];
                this.mixer.clipAction(idle).play();
            }

            this._showLoading(false);
            return true;
        } catch (err) {
            console.error('Avatar yüklenemedi:', err);
            this._showLoading(false, true);
            return false;
        }
    }

    _showLoading(visible, error = false) {
        const el = document.getElementById('avatar3dLoading');
        if (!el) return;
        if (!visible) { el.style.display = 'none'; return; }
        el.style.display = 'flex';
        el.style.background = 'rgba(15, 12, 41, 0.85)';
        el.innerHTML = error
            ? `<span style="font-size:2rem">⚠️</span><p style="margin-top:10px">Yükleme Hatası</p>`
            : `<div class="rpm-spinner"></div><p style="margin-top:10px">3D Model İşleniyor...<br><small style="opacity:0.6">Optimize ediliyor (LOD-1)</small></p>`;
    }

    dispose() {
        cancelAnimationFrame(this._raf);
        this.renderer.dispose();
        this.scene.clear();
    }
}

/* ────────────────────────────────────────────────────────── */
/*  READY PLAYER ME  —  IFRAME CONTROL                        */
/* ────────────────────────────────────────────────────────── */

let viewer3d = null;

export function openRpmCreator() {
    const modal = document.getElementById('rpm3dModal');
    const iframe = document.getElementById('rpm3dIframe');
    const loader = document.getElementById('rpmLoading');

    if (!modal || !iframe) return;

    if (loader) loader.style.display = 'flex';
    iframe.src = RPM_EMBED_URL;
    modal.style.display = 'flex';

    window.addEventListener('message', _onRpmMessage);
}

export function closeRpmCreator() {
    const modal = document.getElementById('rpm3dModal');
    const iframe = document.getElementById('rpm3dIframe');

    if (modal) modal.style.display = 'none';
    if (iframe) iframe.src = ''; // Belleği temizle ve gezintiyi durdur

    window.removeEventListener('message', _onRpmMessage);
}

function _onRpmMessage(event) {
    if (!event.origin.includes('readyplayer.me')) return;

    // RPM Event tiplerine göre yakalama
    if (typeof event.data === 'string' && event.data.endsWith('.glb')) {
        _processAvatar(event.data);
    } else if (typeof event.data === 'object' && event.data?.type === 'v1.avatar.exported') {
        _processAvatar(event.data.data.url);
    }
}

function _processAvatar(url) {
    console.log('🎯 Avatar Hazır:', url);
    closeRpmCreator();
    saveAndDisplay3DAvatar(url);
}

/** GLB URL → kaydet + göster */
async function saveAndDisplay3DAvatar(glbUrl) {
    // Panel'deki 3D canvas'a yükle
    const canvasEl = document.getElementById('avatar3dCanvas');
    if (canvasEl) {
        if (!viewer3d) {
            viewer3d = new AvatarViewer3D(canvasEl);
        }
        await viewer3d.loadAvatar(glbUrl);
    }

    // Backend'e kaydet
    const token = localStorage.getItem('hp_token');
    if (token) {
        try {
            await fetch('/api/auth/avatar3d', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ avatarUrl: glbUrl }),
            });
            // localStorage'ı güncelle
            const user = JSON.parse(localStorage.getItem('hp_user') || '{}');
            user.avatar3d = glbUrl;
            localStorage.setItem('hp_user', JSON.stringify(user));
        } catch (e) {
            console.warn('Avatar kaydedilemedi:', e);
        }
    }

    if (window.showToast) showToast('🎉 3D Avatar kaydedildi!', 'success');
}

/** Sayfa yüklendiğinde mevcut avatar'ı göster */
export async function init3DViewer(glbUrl) {
    const canvasEl = document.getElementById('avatar3dCanvas');
    if (!canvasEl || !glbUrl) return;
    if (!viewer3d) viewer3d = new AvatarViewer3D(canvasEl);
    await viewer3d.loadAvatar(glbUrl);
}

// Global erişim için
window.openRpmCreator = openRpmCreator;
window.closeRpmCreator = closeRpmCreator;
window.init3DViewer = init3DViewer;
