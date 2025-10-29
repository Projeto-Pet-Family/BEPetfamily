const express = require('express');
const router = express.Router();
const contratoPetController = require('../controllers/contratoPetController');

router.post('/', contratoPetController.adicionarPetContrato);
router.delete('/:idContratoPet', contratoPetController.removerPetContrato);
router.get('/contrato/:idContrato', contratoPetController.listarPetsContrato);

module.exports = router;