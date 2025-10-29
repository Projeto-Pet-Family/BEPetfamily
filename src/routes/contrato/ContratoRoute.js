// routes/contratoRoutes.js ou similar
const express = require('express');
const router = express.Router();
const contratoController = require('../controllers/contratoController');

router.get('/', contratoController.lerContratos);
router.get('/usuario/:idUsuario', contratoController.buscarContratosPorUsuario);
router.get('/usuario', contratoController.buscarContratosPorUsuarioEStatus); // Query params: ?idUsuario=X&idStatus=Y
router.get('/:idContrato', contratoController.buscarContratoPorId);
router.post('/', contratoController.criarContrato);
router.put('/:idContrato', contratoController.atualizarContrato);
router.delete('/:idContrato', contratoController.excluirContrato);

module.exports = router;