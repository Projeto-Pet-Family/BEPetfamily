const express = require('express');
const Router = express.Router();
const StatusController = require('../../controllers/contrato/StatusController.js');

Router.get('/status', StatusController.lerStatus);
Router.get('/status/:idStatus', StatusController.buscarStatusPorId);
Router.post('/status', StatusController.criarStatus);
Router.put('/status/:idStatus', StatusController.atualizarStatus);
Router.delete('/status/:idStatus', StatusController.excluirStatus);

module.exports = Router;