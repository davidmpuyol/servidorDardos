process.env.PWD = process.cwd()
var express = require("express");
var siofu = require("socketio-file-upload");
var app = express().use(siofu.router);
var MongoClient = require("mongodb").MongoClient;
var mongoURL = 'mongodb://marco:marcocuma@168.63.17.113:27017?authMechanism=SCRAM-SHA-1&authSource=admin';
app.use(express.static(__dirname+'/public'));
var http = require('http').createServer(app);
var ObjectId = require('mongodb').ObjectId
//Modulo de encriptación
const bcrypt = require('bcrypt');
const fs = require('fs');
const saltRounds = 12;
    

var io = require('socket.io')(http);
var usuariosConectados = {}
function compruebaUsuarios(){
    let idClientes = Object.keys(io.sockets.sockets)
    let userDisc = []
    console.log(idClientes)
    Object.keys(usuariosConectados).forEach((user) => {
      if(!idClientes.includes(usuariosConectados[user].id)){
        userDisc.push(user)
        delete usuariosConectados[user]
      }
    })
    return userDisc
}

var dbo = null;
var db = null;
MongoClient.connect(mongoURL, (err, db)=>{
  if (err) return err;
  db = db;
  dbo = db.db("dardos");
})

//Genera un codigo aleatorio que sera el localizador de la sesion del usuario con la base de datos
function codigo(){
  let valores = "0123456789abcdefABCDEF?¿¡!:;_-ç";
  let longitud = 40;
  let code = "";
  for (x=0; x < longitud; x++)
  {
    rand = Math.floor(Math.random()*valores.length);
    code += valores.substr(rand, 1);
  }
  return code;
}

//le introduces un string y te lo encipta
function encriptar(password){
  return bcrypt.hash(password, saltRounds)
  .then(function(hashedPassword) {
      return hashedPassword;
  })
}
/* encriptar('pedro').then((respuesta)=>{
  console.log(respuesta)
}) */

//compara una contraseña con una contraseña encriptada
function comparar(password,passcript){
  return bcrypt.compare(password, passcript).then(function (same) {
    return same;
  })
}
//loguea al usuario en la base de datos y le devuelve el codigo de la sesion.
function login(mail ,password, socket){
    //obtengo los datos del usuario con ese mail de registro
    var query = { email: mail };
    dbo.collection("usuarios").find(query).toArray((err, result)=>{
      if (result.length == 0)
      //Si no devuelve un resultado manda un mensaje de error
        socket.emit('errorLogin',"El usuario introducido no existe")
      else{
        if(usuariosConectados[result[0].nick])
          socket.emit('errorLogin',"El usuario ya esta logueado")
        else{
          let criptpass = result[0].password
          comparar(password , criptpass).then((correcto)=>{
          if (correcto){

            //general el codigo aleatorio para identificar la sesion
            let codigoRand =result[0].nick+codigo();
  
            //crear una marca de tiempo para saber cuando se logueo
            let time = Date.now()
            let datos = {$set :{online: true, online_id: codigoRand, lastLogin: time}}
            //obtiene los datos que mandara al cliente de vuelta
  
            let user = {nick:result[0].nick,email:result[0].email,img:result[0].img,idSession:codigoRand,tipo_usuario:result[0].tipo_usuario}
            //cambia los datos en la bd y manda un evento al cliente para que este guarde el id de sesion para asi poder indentificarse
            dbo.collection("usuarios").updateOne(query, datos, (err, res)=>{
              if (err) return err;
              //db.close();
            });
            socket.emit('respLogin',user)
          } else {
            //Si la contraseña no coincide manda un mensaje de error
            socket.emit('errorLogin',"Esa contraseña no es la correcta")
          }
        })
        }
      }
    });
}
//registra al usuario en la base de datos 
function register(datos,socket){
  //comprueba que el nick no esta cogido
  dbo.collection('usuarios').find({nick:datos.nick}).toArray((err,result)=>{
    if(result.length>0){
      error = true
      console.log('existe ese nick ')
      socket.emit('resultadoRegistro',{error:"Ya existe un usuario con ese nick"})
    }else{
      //comprueba que el correo no se esta usando en otra cuenta
      dbo.collection('usuarios').find({email:datos.email}).toArray((err2,result2)=>{
        if(result2.length>0){
          console.log('existe ese correo')
          error = true
          socket.emit('resultadoRegistro',{error:"Ya existe un usuario con ese correo"})
        } else {
          //Una vez comprobado todo inserta el usuario en la bd
          encriptar(datos.password).then((passCript)=>{
            let user = {nick:datos.nick, nombre:datos.nombre, email:datos.email, password:passCript,img:'default.png', tipo_usuario:0, online:false, online_id:'', lastLogin:''}
            dbo.collection('usuarios').insertOne(user,function(err,result){
              console.log(result.result.ok)
              socket.emit('resultadoRegistro',{registrado:'Se ha registrado con exito'})
              crearStats(datos.nick);
            })
          })
        }
      })
    }
  })
}
function crearStats(nick){
  //Crea la tabla de estadisticas de un usuario dado
  dbo.collection("usuarios").find({nick:nick}).toArray((err,result)=>{
    let id = result[0]._id.toString()
    let datos = {id_jugador:id,media:0,nDardos:0,nDerrotas:0,nPartidas:0,nVictorias:0,porcentajeVictorias:0}
    dbo.collection('Estadistica_Jugador').insertOne(datos,function (err,result){
      console.log('Tabla de estadisticas creada correctamente para '+nick)
    })
  })
}


function comprobarSesion(id,socket){
  //Comprueba si hay una sesion con ese id abierta y manda los datos de vuelta al usuario
    let query = {online_id: id}
    dbo.collection("usuarios").find(query).toArray((err, result)=>{
      if(result.length > 0){
        if(result[0].online == true){
          let user = {nick:result[0].nick,email:result[0].email,img:result[0].img,tipo_usuario:result[0].tipo_usuario,idSession:result[0].online_id}
          console.log(result)
          socket.emit('respLogin',user)
        }
      }
    })
}
function logout(id){
    //obtengo los datos del usuario con ese mail de registro
    var query = { online_id: id };
    dbo.collection("usuarios").find(query).toArray(function(err, result) {
          delete usuariosConectados[result[0].nick]
          let datos = {$set :{online: false, online_id: ''}}
          let user = result[0]
          //cambia los datos en la bd y manda un evento al cliente para que este guarde el id de sesion para asi poder indentificarse
          dbo.collection("usuarios").updateOne(user, datos, function(err, res) {
            if (err) throw err;
          });
      })
}
//desloguea a los usuarios que llevan logueados mas de una hora
let IntervaloLogin = setInterval(function(){
    //obtengo los datos del usuario con ese mail de registro
    var query = { online: true };
    dbo.collection("usuarios").find(query).toArray(function(err, result) {
      result.forEach((user)=>{
        if((Date.now()-user.lastLogin)>3600000){
          let datos = {$set :{online: false, online_id: ''}}
          delete usuariosConectados[result[0].nick]
          //cambia los datos en la bd y manda un evento al cliente para que este guarde el id de sesion para asi poder indentificarse
          dbo.collection("usuarios").updateOne(user, datos, function(err, res) {
            if (err) throw err;
            console.log('Datos modificados '+res)
          });
        }
      })
    });
},1800000)

function obtenerDatosPerfil(nick,conexion){
  let query = {nick: nick}
  let datos = "Vacio"
  dbo.collection('usuarios').find(query).toArray(function(err, result){
    if(result.length > 0){
      let query2 = {id_jugador: result[0]._id.toString()}
      dbo.collection('Estadistica_Jugador').find(query2).toArray(function(err, result2){
        console.log("resultado perfil");
        console.log(result)
        if(result2.length > 0){
          datos = {img: result[0].img, tipo_usuario: result[0].tipo_usuario, media: result2[0].media, nDardos: result2[0].nDardos, nDerrotas: result2[0].nDerrotas,
          nPartidas: result2[0].nPartidas, nVictorias: result2[0].nVictorias, porcentajeVictorias: result2[0].porcentajeVictorias}
          console.log(datos)
          conexion.emit("respDatosPerfil", datos)
        } else {
          conexion.emit("respDatosPerfil", {error: "No se ha podido acceder a la puntuacion del jugador"})
        }
      })
    } else {
      conexion.emit("respDatosPerfil", {error: "No se ha podido acceder a los datos del jugador"})
    }
  })
}
//Obtener torneos de la base de datos
function crearTorneo(conexion,torneo){
  let query = {nick: torneo.user}
  console.log(torneo)
  dbo.collection('usuarios').find(query).toArray(function(err, result){
    if(result[0].tipo_usuario>=2){
      let datosTorneo = {};
      datosTorneo.nombre = torneo.nombre;
      datosTorneo.img = torneo.img;
      datosTorneo.fecha = torneo.fecha;
      if(result[0].tipo_usuario == 4){
        datosTorneo.tipo = 2
        datosTorneo.creador = "sys"
      } else {
        datosTorneo.tipo = 1
        datosTorneo.creador = torneo.user
      }
      datosTorneo.ganador = "";
      datosTorneo.abierto = true;
      datosTorneo.max_jugadores = torneo.maxJugadores;
      datosTorneo.jugadores = []
      dbo.collection('torneos').insertOne(datosTorneo,function (err,result){
        console.log(result.result.ok);
        //se ha registrado con exito
        conexion.emit('respuestaRegistrarseTorneo',{1:"El torneo se ha registrado con exito"})
      })
    } else {
      conexion.emit('respuestaRegistrarseTorneo',{0:"Tu usuario no tiene los permisos necesarios"})
    }
  });
}
function obtenerTorneos(conexion){
  dbo.collection("torneos").find().toArray(function(err, result) {
    conexion.emit("resultadoTorneos",result)
  });
}
function obtenerTorneosCarousel(conexion){
  let fNow = Date.now()
  dbo.collection("torneos").find({fecha: {$gte: fNow}}).limit(6).toArray(function(err, result) {
    conexion.emit("resultTorneosCarousel",result)
  });
}
function detalleTorneo(conexion,id){
  let query = {"_id":ObjectId(id)}
  dbo.collection("torneos").find(query).toArray(function(err, torneo) {
    if(torneo[0].jugadores.length > 0){
      let queryJugadores = []
      torneo[0].jugadores.forEach((jugador)=>{
        queryJugadores.push(jugador)
      })
      dbo.collection('usuarios').find({"_id":{$in: queryJugadores}}).project({"nick": 1,"_id": 0}).toArray(function(err, result){
        console.log(result)
        torneo[0].jugadores = result
        conexion.emit("resultadoTorneo",torneo[0])
      });
    } else {
      conexion.emit("resultadoTorneo",torneo[0])
    }
  });
}
function apuntarseTorneo(conexion,id,nickJugador){
  let queryUser = {nick: nickJugador}
  let query = {"_id":ObjectId(id)}
  dbo.collection("usuarios").find(queryUser).toArray(function (err, usuario){
    if(usuario.length > 0){
      dbo.collection("torneos").find(query).toArray(function (err, torneo){
        let users = {jugadores:torneo[0].jugadores}
        let estaDentro = false
        users.jugadores.forEach((userid)=>{
          if(userid.equals(usuario[0]._id))
            estaDentro = true
        })
        if(!estaDentro){
          users.jugadores.push(usuario[0]._id)
          dbo.collection("torneos").updateOne(query, {$push:{jugadores:usuario[0]._id}}, function(err, res) {
            if (err) throw err;
            console.log('Datos modificados '+res)
            conexion.emit("respuestaApuntarse",{1:"Se ha apuntado correctamente"})
          });
        } else {
          conexion.emit("respuestaApuntarse",{0:"Ha ocurrido un error, puede que ya este en el torneo. Para asegurarse compruebe si esta en la lista"})
        }
      });
    }else{
      conexion.emit("respuestaApuntarse",{0:"No se ha encontrado su usuario, pruebe a reiniciar la pagina"})  
    }
  });
}
function cambiarDatosPerfil(conexion,datos){
  let query = {nick: datos.nick}
    dbo.collection("usuarios").find(query).toArray((err, result)=>{
        let criptpass = result[0].password
        comparar(datos.pass, criptpass).then((correcto)=>{
        if (correcto){
          dbo.collection("usuarios").find({nick:datos.nuevoNick}).toArray((err, result)=>{
            if(result.length == 0||datos.nick == datos.nuevoNick){
              let datosModificar = {nick:datos.nuevoNick}
              if(datos.img != "")
                datosModificar.img=datos.img
              dbo.collection("usuarios").updateOne(query,{$set:datosModificar},function(err, res) {
                if (err) throw err;
                console.log('Datos modificados '+res)
                conexion.emit("respuestaCambioDatos",{1:"Datos modificados correctamente, recarga la pagina para verlos"})
              });
            } else {
              conexion.emit("respuestaCambioDatos",{0:"Ya hay un usuario con ese nombre"})
            }
          });
         
        }           
      })
  });
}

function almacenarPartida(datos){
  /*
  El parámetro de la funcion es partidas[id]
  -- idPArtida -> datos.idPartida
  datos de los jugadores
  for jugador en datos.jugadores
    datos[jugador]
  partidas[id] = {
            idPartida: id,
            nPartidas: nPartidas,
            partidasTotales: 0,
            jugadores: [],
            turno: salida,
            sigPartida: contrincante
          }
          partidas[id][usuario] = {
            puntos: 501,
            media: 0,
            puntosHechos: 0,
            nDardos: 0,
            tiradas: [],
            marcador: 0,
          }
          partidas[id][contrincante] = {
            puntos: 501,
            media: 0,
            puntosHechos: 0,
            nDardos: 0,
            tiradas: [],
            marcador: 0,
          }
  */
}
/*
app.use((req, res, next) => {
  if (req.header('x-forwarded-proto') !== 'https') {
    res.redirect(`https://${req.header('host')}${req.url}`)
  } else {
    next();
  }
});


/* app.get('*', function(req, res) {
  res.redirect(`https://${req.header('host')}${req.url}`);
}); */
/*
partidas[id] = {
            idPartida: id,
            nPartidas: nPartidas,
            partidasTotales: 0,
            jugadores: [],
            turno: salida,
            sigPartida: contrincante
          }
*/

function nuevaPartida(id){
  let partida = partidas[id];

  jugador1 = partida.jugadores[0];
  partida[jugador1].puntos = 501;
  partida[jugador1],tiradas = [];

  jugador2 = partida.jugadores[1];
  partida[jugador2].puntos = 501;
  partida[jugador2],tiradas = [];

  partida.turno = partida.sigPartida;
  partida.sigPartida = partida.sigPartida == jugador1 ? jugador2 : jugador1;
  partidas[id] = partida;
}


var partidas = {};
var idPartidas = {};
io.on('connection', function(socket){
      var uploader = new siofu();
      uploader.dir = "./public/img";
      uploader.listen(socket);
      partida = null;
      console.log(socket.id+" conectado");
      socket.emit('user','estas conectado')
      socket.on('paginaJuego',function(user){
        console.log(user+" preparado para jugar");
        if(idPartidas[user]){
          idPartidas[user].id = socket.id;
          if(idPartidas[user].partida){
            console.log(user+ " ya está en una partida");
            socket.emit('recarga');
          }
        }
        else{
          idPartidas[user] = {id: socket.id}
        }
      })
      uploader.on('saved',function(event){
        console.log(event)
        let dir = "./public/img"
        fs.rename(event["file"]["pathName"], dir+event["file"]["meta"]["path"],(err) => {
          if (err) throw err;
          console.log('Rename complete!');
          socket.emit('imagenSubida',event["file"]["meta"]["nombre"])
        })
      })
      socket.on('userConected',(usr)=>{
        usuariosConectados[usr.nick] = {id:socket.id,ready:false,nick:usr.nick,img:usr.img,tipo_usuario:usr.tipo_usuario};
        console.log(usuariosConectados)
        io.emit('listaUsuarios',usuariosConectados)
      });
      socket.on('mensaje',(msg) => {
        console.log(msg)
        if(msg.userDest == 'general')
          io.emit('reenvio',msg)
        else
          io.sockets.in(msg['dest']).emit('reenvio',msg)
      })
      socket.on('solicitarDatosPerfil',(nick)=>{
        console.log(nick)
        obtenerDatosPerfil(nick,socket)
      })
      //Eventos relacionados con la sesion
      socket.on('login',function(datos){
        login(datos.email,datos.password,socket)
      })
      socket.on('register',function(datos){
        register(datos,socket)
      })
      socket.on('comprobarSesion',function(id){
        comprobarSesion(id,socket)
      })
      socket.on('logout',function(id){
        logout(id)
      })
      socket.on('disconnect', function() {
        console.log(socket.id+" desconectado");
        let usuarioDesc = compruebaUsuarios()
        io.emit('usuarioDesc',usuarioDesc)
        socket.broadcast.emit('bye');
      });
      socket.on('cambiarDatosPerfil',(datos)=>{
        cambiarDatosPerfil(socket,datos)
      })
      socket.on('checked',(clave) => {
        console.log('entra en el checked')
        usuariosConectados[clave].ready=!usuariosConectados[clave].ready
        socket.broadcast.emit('cambEstado',clave)
      });
      //Evento para obtener torneos
      socket.on('crearTorneo',(datos)=>{
        crearTorneo(socket,datos)
      })
      socket.on('getTorneos',()=>{
        obtenerTorneos(socket)
      })
      socket.on('detalleTorneo',(id)=>{
        detalleTorneo(socket,id)
      })
      socket.on('apuntarseTorneo',(datos)=>{
        console.log("entra en apuntar torneo")
        apuntarseTorneo(socket,datos.idTorneo,datos.nickJugador)
      })
      socket.on('getTorneosCarousel',()=>{
        obtenerTorneosCarousel(socket)
      })
      //Eventos relacionados con la partida
      socket.on('preparado', function(contrincante) {
        console.log('preparado enviado a '+contrincante);
        if(idPartidas[contrincante]){
          socket.to(idPartidas[contrincante].id).emit('preparado');
        }
      });
      socket.on('offer', function (message, contrincante) {
        console.log('offer');
        socket.to(idPartidas[contrincante].id).emit('offer', message);
      });
      socket.on('answer', function (message,contrincante) {
        console.log('answer');
        socket.to(idPartidas[contrincante].id).emit('answer', message);
      });
      socket.on('candidate', function (message,contrincante) {
        console.log('candidate');
        socket.to(idPartidas[contrincante].id).emit('candidate', message);
      });
      socket.on('invitar', function(usuario, invitador){
        console.log(usuariosConectados);
        console.log(usuario);
        socket.to(usuariosConectados[usuario].id).emit('invitacion', invitador);
      })
      socket.on('aceptarInvitacion',function(usuario,invitador){
        socket.to(usuariosConectados[usuario].id).emit('invitacionAceptada', invitador);
      })
      socket.on('rechazarInvitacion',function(usuario,invitador){
        socket.to(usuariosConectados[usuario].id).emit('invitacionRechazada', invitador);
      })
      socket.on('comenzarPartida',function(usuario, contrincante, datosPartida){
        let id
        let nPartidas = datosPartida.nPartidas;
        let salida = datosPartida.salida;
        if(!idPartidas[usuario].partida){
          id = codigo();
          partidas[id] = {
            idPartida: id,
            nPartidas: nPartidas,
            partidasTotales: 0,
            jugadores: [],
            turno: salida,
            sigPartida: contrincante
          }
          partidas[id][usuario] = {
            puntos: 501,
            media: 0,
            puntosHechos: 0,
            nDardos: 0,
            tiradas: [],
            marcador: 0,
          }
          partidas[id][contrincante] = {
            puntos: 501,
            media: 0,
            puntosHechos: 0,
            nDardos: 0,
            tiradas: [],
            marcador: 0,
          }
          idPartidas[usuario].partida = id;
          idPartidas[contrincante].partida = id;
          partidas[id].jugadores = [usuario,contrincante];
          //socket.to(usuariosConectados[contrincante].id).emit('comenzarPartida',partidas[id]);
          socket.emit('comenzarPartida', partidas[id]);
          socket.to(idPartidas[contrincante].id).emit('comenzarPartida',partidas[id]);
          socket.to(idPartidas[usuario].id).emit('comenzarPartida',partidas[id]);
          console.log("nueva partida creada");
          partida = id;
          console.log(partidas[id]);
        }
        else{
          id = idPartidas[usuario].partida;
          console.log('la partida ya existe');
          console.log(partidas[id]);
          socket.emit('comenzarPartida',partidas[id]);
          socket.to(idPartidas[contrincante].id).emit('comenzarPartida',partidas[id]);
          socket.to(idPartidas[usuario].id).emit('comenzarPartida',partidas[id]);
        }
      })
      socket.on('tirada',function(data, usuario, contrincante){
        let idPartida = data.idPartida;
        let turno = partidas[idPartida].turno;
        console.log('tirada');
        console.log(data);
        console.log('partida antes de cambios');
        console.log(partidas[idPartida]);
        partidas[idPartida][turno].puntos -= data.puntos;
        partidas[idPartida][turno].tiradas.push(data.puntos);
        partidas[idPartida][turno].nDardos += data.dardos;
        partidas[idPartida][turno].puntosHechos += data.puntos;
        partidas[idPartida][turno].media = (partidas[idPartida][turno].puntosHechos/partidas[idPartida][turno].nDardos*3).toFixed(2);
        console.log('partida despues de cambios');
        console.log(partidas[idPartida])
        if(partidas[idPartida][turno].puntos == 0){
          partidas[idPartida][turno].marcador += 1;
          socket.emit('ganador', partidas[idPartida].turno);
          socket.to(idPartidas[contrincante]).emit('ganador', partidas[idPartida].turno);
          //io.emit('ganador', partidas[idPartida].turno);
          partidas[idPartida].partidasTotales++;
          if(partidas[idPartida].nPartidas == partidas[idPartida].partidasTotales){
            console.log('Fin del juego');
            socket.emit('findeljuego', partidas[idPartida]);
            socket.to(idPartidas[contrincante].id).emit('findeljuego', partidas[idPartida]);
            almacenarPartida(partidas[idPartida]);
            delete partidas[idPartida];
          }
          else{
            nuevaPartida(idPartida);
            console.log('Nueva Partida');
            //io.emit('comenzarPartida',partidas[idPartida]);
            socket.emit('comenzarPartida',partidas[idPartida]);
            socket.to(idPartidas[contrincante].id).emit('comenzarPartida',partidas[idPartida]);
          }
        }
        else{
          let jugadores = partidas[idPartida].jugadores;
          partidas[idPartida].turno = partidas[idPartida].turno == jugadores[0] ? jugadores[1] : jugadores[0];
          socket.emit('tirada', partidas[idPartida]);
          socket.to(idPartidas[contrincante].id).emit('tirada', partidas[idPartida]);
        }
      })
});
http.listen(process.env.PORT || 3000, function(){
  console.log('listening on *:3000');
});

