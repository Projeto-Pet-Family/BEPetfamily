const express = require('express');
const Route = express.Router();
const ContratoController = require('../../controllers/contrato/ContratoController.js')

Route.get('/contrato', ContratoController.lerContratos);
Route.get('/contrato/:idContrato', ContratoController.buscarContratoPorId);
Route.post('/contrato', ContratoController.criarContrato);
Route.put('/contrato/:idContrato', ContratoController.atualizarContrato);
Route.delete('/contrato/:idContrato', ContratoController.excluirContrato);

module.exports = Route;