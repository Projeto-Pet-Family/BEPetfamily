// routes/contratoRoutes.js ou similar
const express = require('express');
const router = express.Router();
const contratoController = require('../../controllers/contrato/ContratoController');

router.get('/contrato', contratoController.lerContratos);
router.get('/contrato/usuario/:idUsuario', contratoController.buscarContratosPorUsuario);
router.get('/contrato/:idContrato', contratoController.buscarContratoPorId);
router.post('/contrato', contratoController.criarContrato);
router.put('/contrato/:idContrato', contratoController.atualizarContrato);
router.delete('/contrato/:idContrato', contratoController.excluirContrato);
router.delete('/contrato/:idContrato/servico/:idServico', contratoController.excluirServicoContrato);
router.delete('/contrato/:idContrato/pet/:idPet', contratoController.excluirPetContrato);
router.put('/contrato/:idContrato/atualizar-data', contratoController.atualizarDatasContrato);

module.exports = router;