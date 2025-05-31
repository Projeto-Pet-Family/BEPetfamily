const express = require('express');
const Router = express.Router();
const CEPController = require('../../../controllers/hospedagem/endereco/CepController.js');

Router.get('/ceps', CEPController.lerCEPs);
Router.get('/ceps/:idCEP', CEPController.buscarCEPPorId);
Router.post('/ceps', CEPController.criarCEP);
Router.put('/ceps/:idCEP', CEPController.atualizarCEP);
Router.delete('/ceps/:idCEP', CEPController.excluirCEP);

module.exports = Router;