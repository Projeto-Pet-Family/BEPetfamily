const express = require('express');
const Router = express.Router();
const LogradouroController = require('../../../controllers/hospedagem/endereco/LogradouroController.js');

Router.get('/logradouros', LogradouroController.lerLogradouros);
Router.get('/logradouros/:idLogradouro', LogradouroController.buscarLogradouroPorId);
Router.post('/logradouros', LogradouroController.criarLogradouro);
Router.put('/logradouros/:idLogradouro', LogradouroController.atualizarLogradouro);
Router.delete('/logradouros/:idLogradouro', LogradouroController.excluirLogradouro);

module.exports = Router;