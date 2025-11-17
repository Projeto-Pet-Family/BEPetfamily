const express = require('express')
const Router = express.Router()
const UsuarioController = require('../../controllers/usuario/UsuarioController.js')
const PetController = require('../../controllers/pet/PetController.js')

// Rotas de usuário
Router.get('/usuarios', UsuarioController.lerUsuarios)
Router.get('/usuarios/:idUsuario', UsuarioController.buscarUsuarioPorId) // Adicionei esta que estava faltando
Router.post('/usuarios', UsuarioController.inserirUsuario)
Router.put('/usuarios/:idUsuario', UsuarioController.atualizarUsuario)
Router.delete('/usuarios/:idUsuario', UsuarioController.excluirUsuario)

// Rotas de pet para usuário
Router.post('/usuarios/pet', PetController.inserirPetParaNovoUsuario)

module.exports = Router 