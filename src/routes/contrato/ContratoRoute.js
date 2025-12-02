const express = require('express');
const router = express.Router();
const contratoController = require('../../controllers/contrato/ContratoController');

// Rotas básicas de CRUD
router.get('/contrato', contratoController.lerContratos);
router.get('/contrato/:idContrato', contratoController.buscarContratoPorId);
router.post('/contrato', contratoController.criarContrato);
router.put('/contrato/:idContrato', contratoController.atualizarContrato);
router.delete('/contrato/:idContrato', contratoController.excluirContrato);

// Rotas por usuário
router.get('/contrato/usuario/:idUsuario', contratoController.buscarContratosPorUsuario);
router.get('/contrato/usuario/:idUsuario/status', contratoController.buscarContratosPorUsuarioEStatus);

// Rotas de serviços
router.post('/contrato/:idContrato/servico', contratoController.adicionarServicoContrato);
router.delete('/contrato/:idContrato/servico/:idServico', contratoController.excluirServicoContrato);

// Rotas de pets
router.post('/contrato/:idContrato/pet', contratoController.adicionarPetContrato);
router.delete('/contrato/:idContrato/pet/:idPet', contratoController.excluirPetContrato);

// Rotas de datas
router.put('/contrato/:idContrato/data', contratoController.atualizarDatasContrato);

// Rotas de status
router.put('/contrato/:idContrato/status', contratoController.atualizarStatusContrato);
router.put('/contrato/:idContrato/alterar-status', contratoController.alterarStatusContrato);
router.get('/contrato/:idContrato/transicoes-status', contratoController.obterTransicoesStatus);

// Rota de cálculo
router.get('/contrato/:idContrato/calcular', contratoController.calcularValorContrato);

module.exports = router;