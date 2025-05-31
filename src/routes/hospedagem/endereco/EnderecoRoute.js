const express = require('express');
const Router = express.Router();
const EnderecoController = require('../../../controllers/hospedagem/endereco/EnderecoController.js');

Router.get('/enderecos', EnderecoController.lerEnderecos);
Router.get('/enderecos/:idEndereco', EnderecoController.buscarEnderecoPorId);
Router.post('/enderecos', EnderecoController.criarEndereco);
Router.put('/enderecos/:idEndereco', EnderecoController.atualizarEndereco);
Router.delete('/enderecos/:idEndereco', EnderecoController.excluirEndereco);

module.exports = Router;