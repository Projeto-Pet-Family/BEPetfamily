const express = require('express');
const router = express.Router();
const contratoPetController = require('../../controllers/contrato/ContratoPetController.js');

router.post('/contratopet', contratoPetController.adicionarPetContrato);
router.delete('/contratopet/:idContratoPet', contratoPetController.removerPetContrato);
router.get('/contratopet/:idContrato', contratoPetController.listarPetsContrato);

module.exports = router;