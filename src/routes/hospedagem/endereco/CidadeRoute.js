const express = require('express');
const Router = express.Router();
const CidadeController = require('../../../controllers/hospedagem/endereco/CidadeController.js');

Router.get('/cidades', CidadeController.lerCidades);
Router.get('/cidades/:idCidade', CidadeController.buscarCidadePorId);
Router.post('/cidades', CidadeController.criarCidade);
Router.put('/cidades/:idCidade', CidadeController.atualizarCidade);
Router.delete('/cidades/:idCidade', CidadeController.excluirCidade);

module.exports = Router;