// =============================================
// HakPortal - Settings Route (MySQL)
// =============================================
const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

// ---- GET /api/settings/public ----
router.get('/public', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT setting_key, setting_value FROM system_settings');
        const s = {};
        rows.forEach(r => { s[r.setting_key] = r.setting_value; });

        res.json({
            kidemTavani: parseFloat(s.kidem_tavani) || 35058.58,
            platformAdi: s.platform_adi || 'HakPortal',
            hizmetBedeliSkala: [
                { min: 0, max: 20000, ucret: parseFloat(s.hizmet_bedeli_0_20) || 750 },
                { min: 20000, max: 50000, ucret: parseFloat(s.hizmet_bedeli_20_50) || 1250 },
                { min: 50000, max: 999999999, ucret: parseFloat(s.hizmet_bedeli_50_plus) || 2000 }
            ]
        });
    } catch (err) {
        // Fallback değerler
        res.json({
            kidemTavani: 35058.58,
            platformAdi: 'HakPortal',
            hizmetBedeliSkala: [
                { min: 0, max: 20000, ucret: 750 },
                { min: 20000, max: 50000, ucret: 1250 },
                { min: 50000, max: 999999999, ucret: 2000 }
            ]
        });
    }
});

module.exports = router;
