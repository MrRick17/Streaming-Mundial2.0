document.addEventListener('DOMContentLoaded', () => {

    // ==========================================
    // 0. MODO PRUEBA LOCAL (PROTECCIÓN DE DATOS)
    // ==========================================
    const MODO_PRUEBA = false; 

    // ==========================================
    // 1. INICIALIZACIÓN DE FIREBASE (SM 2)
    // ==========================================
    const firebaseConfig = {
        apiKey: "AIzaSyBA0NsciehTINXpRz50VzB-Vu2_KAFaOlc",
        authDomain: "streaming-mundial-2.firebaseapp.com",
        projectId: "streaming-mundial-2",
        storageBucket: "streaming-mundial-2.firebasestorage.app",
        messagingSenderId: "973602705953",
        appId: "1:973602705953:web:2b67d4e70198e93ea58960"
    };

    if (!firebase.apps.length) {
        firebase.initializeApp(firebaseConfig);
    }
    const db = firebase.firestore();

    // Estado global en memoria
    let cuentas = [];
    let clientes = [];
    let historialPagos = [];
    let costosProveedores = {};

    // ==========================================
    // 2. SISTEMA DE NOTIFICACIONES (TOAST)
    // ==========================================
    const mostrarNotificacion = (mensaje, tipo = 'success') => {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast--${tipo}`; 
        const icono = tipo === 'success' ? 'fa-circle-check' : (tipo === 'info' ? 'fa-circle-info' : 'fa-bell');
        toast.innerHTML = `<i class="fa-solid ${icono}"></i> ${mensaje}`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast--hiding');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    };

    const toggleModal = (modalId, show) => {
        const modal = document.getElementById(modalId);
        if (modal) {
            if (show) modal.classList.remove('modal-oculto'); 
            else modal.classList.add('modal-oculto'); 
        }
    };

    // ==========================================
    // 3. NAVEGACIÓN ENTRE VISTAS (SPA)
    // ==========================================
    const navItems = document.querySelectorAll('.nav-item');
    const vistas = document.querySelectorAll('.vista-seccion');

    if (navItems.length > 0 && vistas.length > 0) {
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault(); 
                const destino = item.getAttribute('data-vista');
                if (!destino) return;

                navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');

                vistas.forEach(vista => vista.classList.add('vista-oculta'));
                
                const vistaAMostrar = document.getElementById(`vista-${destino}`);
                if (vistaAMostrar) vistaAMostrar.classList.remove('vista-oculta');
            });
        });
    }

    // ==========================================
    // 4. SINCRONIZACIÓN CON FIREBASE O LOCAL
    // ==========================================
    const guardarNube = () => {
        if (MODO_PRUEBA) {
            localStorage.setItem('streamingMundialData', JSON.stringify({ cuentas, clientes, historialPagos, costosProveedores }));
            return;
        }

        db.collection('sistema').doc('datosPrincipales').set({
            cuentas: cuentas,
            clientes: clientes,
            historialPagos: historialPagos,
            costosProveedores: costosProveedores
        }).catch(error => {
            console.error("Error al guardar en Firebase:", error);
            mostrarNotificacion("Error de conexión con la base de datos", "info");
        });
    };

    const escucharNubeEnTiempoReal = () => {
        const refrescarVistasConFiltroActual = () => {
            actualizarDashboard();
            renderizarVistaCostos();

            const filtroCuentasActivo = document.querySelector('#vista-cuentas .btn-filtro.active');
            const valFiltroCuentas = filtroCuentasActivo ? filtroCuentasActivo.getAttribute('data-filtro') : 'Todas';
            const textoBusqCuentas = document.getElementById('buscador-cuentas')?.value || '';
            if (textoBusqCuentas.trim() !== '') {
                renderizarCuentas(textoBusqCuentas);
            } else {
                renderizarCuentas(valFiltroCuentas === 'Todas' ? '' : valFiltroCuentas);
            }

            const filtroClientesActivo = document.querySelector('#vista-clientes .btn-filtro.active');
            const valFiltroClientes = filtroClientesActivo ? filtroClientesActivo.getAttribute('data-filtro') : 'todos';
            renderizarClientes(valFiltroClientes);
        };

        if (MODO_PRUEBA) {
            const localData = JSON.parse(localStorage.getItem('streamingMundialData'));
            if (localData) {
                cuentas = localData.cuentas || [];
                clientes = localData.clientes || [];
                historialPagos = localData.historialPagos || [];
                costosProveedores = localData.costosProveedores || {};
            }
            refrescarVistasConFiltroActual();
            return;
        }

        db.collection('sistema').doc('datosPrincipales').onSnapshot((doc) => {
            if (doc.exists) {
                const data = doc.data();
                cuentas = data.cuentas || [];
                clientes = data.clientes || [];
                historialPagos = data.historialPagos || [];
                costosProveedores = data.costosProveedores || {};
            }
            refrescarVistasConFiltroActual();
        }, (error) => {
            console.error("Error al escuchar Firebase:", error);
        });
    };

    // ==========================================
    // 5. REGISTRO EN HISTORIAL CONTABLE
    // ==========================================
    const registrarTransaccionHistorial = (monto, plataforma, clienteId) => {
        const fechaActual = new Date();
        const mesStr = `${fechaActual.getFullYear()}-${String(fechaActual.getMonth() + 1).padStart(2, '0')}`;
        
        historialPagos.push({
            id: Date.now(),
            clienteId: clienteId,
            monto: parseFloat(monto) || 0,
            plataforma: plataforma,
            fecha: fechaActual.getTime(),
            mes: mesStr
        });
        guardarNube();
    };

    // ==========================================
    // 6. VERIFICACIÓN DE VENCIMIENTOS
    // ==========================================
    const verificarVencimientosClientes = () => {
        const ahora = new Date();
        const inicioHoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate()).getTime();
        const finMañana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 23, 59, 59, 999).getTime();

        let actualizado = false;
        clientes.forEach(c => {
            if (!c.fechaVencimiento) return;

            let nuevoEstado = 'aldia';
            if (c.fechaVencimiento < inicioHoy) {
                nuevoEstado = 'moroso';
            } else if (c.fechaVencimiento <= finMañana) {
                nuevoEstado = 'vence-hoy';
            } else {
                nuevoEstado = 'aldia';
            }

            if (c.estado !== nuevoEstado) {
                c.estado = nuevoEstado;
                actualizado = true;
            }
        });
        if (actualizado) guardarNube();
    };

    const verificarVencimientosCuentas = () => {
        const hoy = new Date();
        const hoyInicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).getTime();
        const limiteAviso = hoyInicio + (2 * 24 * 60 * 60 * 1000);

        let actualizado = false;
        cuentas.forEach(c => {
            if (!c.fechaVencimiento) return; 

            let nuevoEstado = 'aldia';
            if (c.fechaVencimiento < hoyInicio) nuevoEstado = 'vencida';
            else if (c.fechaVencimiento <= limiteAviso) nuevoEstado = 'por-vencer';

            if (c.estado !== nuevoEstado) {
                c.estado = nuevoEstado;
                actualizado = true;
            }
        });
        if (actualizado) guardarNube();
    };

    // AVISO AUTOMÁTICO AL ENTRAR
    let alertaInicioMostrada = false;

    const mostrarModalAvisoHoy = (clientesHoy) => {
        let modal = document.getElementById('modal-aviso-vencidos-hoy');
        
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'modal-aviso-vencidos-hoy';
            modal.className = 'modal-overlay z-alto'; 
            modal.innerHTML = `
                <div class="modal-box" style="text-align: center; padding: 35px 25px; max-width: 400px; border-top: 4px solid #F59E0B;">
                    <div style="font-size: 3.5rem; color: #F59E0B; margin-bottom: 15px; filter: drop-shadow(0 5px 15px rgba(245, 158, 11, 0.4));">
                        <i class="fa-solid fa-clock"></i>
                    </div>
                    <h3 class="modal-box__title" style="color: #FFFFFF; font-size: 1.4rem; font-weight: 900; margin-bottom: 10px;">Aviso de Vencimiento</h3>
                    <p class="modal-box__text" id="texto-aviso-hoy" style="color: rgba(255, 255, 255, 0.85); font-size: 0.95rem; line-height: 1.6; margin-bottom: 25px;"></p>
                    <div class="modal-box__buttons" style="display: flex; justify-content: center;">
                        <button id="btn-cerrar-aviso-hoy" class="btn-primario btn-full-mt" style="width: 100%; margin-top: 0; padding: 12px; border-radius: 14px;">Entendido</button>
                    </div>
                </div>
            `;
            document.body.appendChild(modal);

            document.getElementById('btn-cerrar-aviso-hoy').addEventListener('click', () => {
                modal.classList.add('modal-oculto');
            });
        }

        document.getElementById('texto-aviso-hoy').innerHTML = `Tienes <strong>${clientesHoy.length}</strong> cliente(s) cuyo servicio vence exactamente el día de hoy.`;
        modal.classList.remove('modal-oculto');
    };

    const verificarAlertasAlEntrar = () => {
        if (alertaInicioMostrada) return;
        if (typeof clientes === 'undefined' || !Array.isArray(clientes)) return;

        alertaInicioMostrada = true;

        const hoy = new Date();
        const anioHoy = hoy.getFullYear();
        const mesHoy = hoy.getMonth();
        const diaHoy = hoy.getDate();

        const clientesHoy = clientes.filter(c => {
            if (!c.fechaVencimiento) return false;
            const f = new Date(c.fechaVencimiento);
            return f.getFullYear() === anioHoy && f.getMonth() === mesHoy && f.getDate() === diaHoy;
        });

        if (clientesHoy.length > 0) {
            setTimeout(() => {
                mostrarModalAvisoHoy(clientesHoy);
            }, 1000);
        }
    };

    // ==========================================
    // 7. RENDERIZADO DE TARJETAS DE CLIENTE
    // ==========================================
    const generarHTMLTarjetaCliente = function(c) {
        const esMoroso = c.estado === 'moroso';
        const esHoy = c.estado === 'vence-hoy';
        
        let iniciales = 'CL';
        if (c.nombre) {
            const partes = c.nombre.split(' ');
            iniciales = partes.map(function(n) { return n[0]; }).join('').substring(0, 2).toUpperCase();
        }

        const bgGradient = esMoroso ? 'bg-gradient-danger' : esHoy ? 'bg-gradient-warning' : 'bg-gradient-success';
        const badgeTexto = esMoroso ? 'Atrasado' : esHoy ? 'Vence Hoy/Mañana' : 'Al Día';

        let icon = 'fa-solid fa-play'; 
        if (c.servicioPlataforma.indexOf('Spotify') !== -1) { icon = 'fa-brands fa-spotify'; }
        else if (c.servicioPlataforma === 'Max') { icon = 'fa-solid fa-tv'; }
        else if (c.servicioPlataforma === 'Disney+') { icon = 'fa-solid fa-star'; }
        else if (c.servicioPlataforma === 'Crunchyroll') { icon = 'fa-solid fa-fire'; }
        else if (c.servicioPlataforma === 'YouTube Premium') { icon = 'fa-brands fa-youtube'; }
        else if (c.servicioPlataforma === 'Canva') { icon = 'fa-solid fa-palette'; }
        else if (c.servicioPlataforma === 'CapCut') { icon = 'fa-solid fa-video'; }
        else if (c.servicioPlataforma === 'Amazon Prime') { icon = 'fa-brands fa-amazon'; }
        else if (c.servicioPlataforma === 'IPTV') { icon = 'fa-solid fa-satellite-dish'; }
        else if (c.servicioPlataforma === 'ViX') { icon = 'fa-solid fa-video'; }
        else if (c.servicioPlataforma === 'Paramount+') { icon = 'fa-solid fa-mountain'; }

        let fechaTexto = 'Sin Fecha';
        if (c.fechaVencimiento) {
            const f = new Date(c.fechaVencimiento);
            let dStr = String(f.getDate()); if (dStr.length === 1) dStr = '0' + dStr;
            let mStr = String(f.getMonth() + 1); if (mStr.length === 1) mStr = '0' + mStr;
            fechaTexto = dStr + '/' + mStr + '/' + f.getFullYear();
        }

        const correoAMostrar = (c.servicioPlataforma.indexOf('Spotify') !== -1 && c.correoPersonal) ? c.correoPersonal : c.servicioCorreo;
        const btnTextoRenovar = (esMoroso || esHoy) ? 'Cobrar' : 'Renovar';
        const iconRenovar = (esMoroso || esHoy) ? 'fa-solid fa-bell' : 'fa-solid fa-receipt';
        const claseBotonPago = (esMoroso || esHoy) ? 'danger' : 'success';

        return `
            <div class="cliente-card ${bgGradient}">
                <div style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 15px; border-bottom: 1px solid rgba(255,255,255,0.18);">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div class="glass-icon-circle" style="font-weight: 800; font-size: 1.1rem; color: #FFFFFF;">
                            ${iniciales}
                        </div>
                        <div>
                            <h3 style="margin: 0; font-size: 1.15rem; color: #FFFFFF; font-weight: 800; text-shadow: 0 2px 8px rgba(0,0,0,0.3);">${c.nombre}</h3>
                            <span style="background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; font-weight: 800; color: #FFFFFF; border: 1px solid rgba(255,255,255,0.25); display: inline-block; margin-top: 5px; text-transform: uppercase; letter-spacing: 0.5px;">${badgeTexto}</span>
                        </div>
                    </div>
                    <button onclick="eliminarCliente(${c.id})" title="Borrar" type="button" style="background: rgba(239,68,68,0.25); border: 1px solid rgba(239,68,68,0.5); color: #ff9999; cursor: pointer; font-size: 1rem; width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: 0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.4)'" onmouseout="this.style.background='rgba(239,68,68,0.25)'"><i class="fa-solid fa-trash"></i></button>
                </div>
                
                <div style="padding: 16px 0;">
                    <div style="display: flex; align-items: center; gap: 14px;">
                        <div class="glass-icon-circle" style="background: rgba(255,255,255,0.18);">
                            <i class="${icon}"></i>
                        </div>
                        <div style="flex: 1;">
                            <p style="margin: 0; font-size: 1rem; font-weight: 800; color: #FFFFFF;">
                                ${c.servicioPlataforma} <span style="font-size: 0.8rem; font-weight: 500; opacity: 0.9;">(${c.servicioDetalle})</span>
                                <span style="float: right; font-size: 1.2rem; font-weight: 900; color: #38BDF8; text-shadow: 0 2px 10px rgba(56,189,248,0.4);">$${parseFloat(c.montoPago || 0).toFixed(2)}</span>
                            </p>
                            <p style="margin: 5px 0 0 0; font-size: 0.85rem; color: rgba(255,255,255,0.9); font-weight: 500; word-break: break-all;">${correoAMostrar}</p>
                            <p style="margin: 6px 0 0 0; font-size: 0.82rem; font-weight: 700; color: #FFFFFF;">
                                <i class="fa-regular fa-calendar" style="margin-right: 5px; opacity: 0.8;"></i>Vence: ${fechaTexto}
                            </p>
                        </div>
                    </div>
                </div>

                <div style="display: flex; gap: 10px; padding-top: 14px; border-top: 1px solid rgba(255,255,255,0.18); flex-wrap: wrap;">
                    <button class="glass-btn" onclick="abrirModalCliente(${c.id})" type="button"><i class="fa-solid fa-pen-to-square"></i> Editar</button>
                    <button class="glass-btn ${claseBotonPago}" onclick="abrirModalPago(${c.id})" type="button"><i class="${iconRenovar}"></i> ${btnTextoRenovar}</button>
                    ${(esMoroso || esHoy) 
                        ? `<button class="glass-btn" style="background: linear-gradient(135deg, rgba(37,211,102,0.4), rgba(18,140,126,0.6)); border-color: rgba(37,211,102,0.7);" onclick="enviarRecordatorio(${c.id})" type="button"><i class="fa-brands fa-whatsapp"></i> ${c.estadoAviso === 'avisado' ? 'Reenviar' : 'Avisar'}</button>` 
                        : ``
                    }
                </div>
            </div>
        `;
    };

    // ==========================================
    // 8. ACTUALIZACIÓN DEL DASHBOARD Y KPIS
    // ==========================================
    const actualizarDashboard = () => {
        verificarVencimientosClientes();
        verificarVencimientosCuentas();

        const kpiMadres = document.getElementById('kpi-madres');
        const kpiAldia = document.getElementById('kpi-aldia');
        const kpiMora = document.getElementById('kpi-mora');
        const kpiIngresos = document.getElementById('kpi-ingresos');

        const totalCuentas = cuentas.length;
        const totalAldia = clientes.filter(c => c.estado === 'aldia').length;
        const totalMorosos = clientes.filter(c => c.estado === 'moroso' || c.estado === 'vence-hoy').length; 
        const totalEsperado = clientes.reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);

        if (kpiMadres) kpiMadres.textContent = totalCuentas;
        if (kpiAldia) kpiAldia.textContent = totalAldia;
        if (kpiMora) kpiMora.textContent = totalMorosos;
        if (kpiIngresos) kpiIngresos.textContent = `$${totalEsperado.toFixed(2)}`;

        renderizarDashboardServicios();
        renderizarReportesFinancieros(totalEsperado);
        
        const contVenceHoy = document.getElementById('contenedor-vence-hoy');
        const sectionVenceHoy = document.getElementById('section-vence-hoy');
        if (contVenceHoy && sectionVenceHoy) {
            const vencenHoy = clientes.filter(c => c.estado === 'vence-hoy');
            if (vencenHoy.length > 0) {
                sectionVenceHoy.classList.remove('vista-oculta');
                contVenceHoy.innerHTML = vencenHoy.map(c => generarHTMLTarjetaCliente(c)).join('');
            } else {
                sectionVenceHoy.classList.add('vista-oculta');
                contVenceHoy.innerHTML = '';
            }
        }

        const contCuentasVencen = document.getElementById('contenedor-cuentas-vencen');
        const sectionCuentasVencen = document.getElementById('section-cuentas-vencen');
        if (contCuentasVencen && sectionCuentasVencen) {
            const cuentasVencen = cuentas.filter(c => c.estado === 'por-vencer' || c.estado === 'vencida');
            if (cuentasVencen.length > 0) {
                sectionCuentasVencen.classList.remove('vista-oculta');
                contCuentasVencen.innerHTML = cuentasVencen.map(c => {
                    let fechaText = "Sin fecha";
                    if(c.fechaVencimiento) {
                        const f = new Date(c.fechaVencimiento);
                        fechaText = `${String(f.getDate()).padStart(2, '0')}/${String(f.getMonth() + 1).padStart(2, '0')}/${f.getFullYear()}`;
                    }

                    return `
                    <div class="cuenta-card ${c.estado === 'vencida' ? 'card-alerta' : ''}" style="margin-bottom: 15px; ${c.estado === 'por-vencer' ? 'border-left: 5px solid #F59E0B;' : ''}">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div>
                                <h3 style="margin: 0; font-size: 1.1rem; color: #1F2937;"><i class="${c.icono}" style="color: ${c.color}; margin-right: 8px;"></i>${c.plataforma}</h3>
                                <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: #6B7280;">${c.correo}</p>
                                <p style="margin: 2px 0 0 0; font-size: 0.75rem; font-weight: bold; color: ${c.estado === 'vencida' ? '#EF4444' : '#F59E0B'};">
                                    <i class="fa-regular fa-calendar" style="margin-right: 3px;"></i> Fecha: ${fechaText}
                                </p>
                            </div>
                            <span class="badge ${c.estado === 'vencida' ? 'badge-vencida' : 'badge-warning'}">${c.estado === 'vencida' ? 'Vencida' : 'Vence pronto'}</span>
                        </div>
                    </div>
                `}).join('');
            } else {
                sectionCuentasVencen.classList.add('vista-oculta');
                contCuentasVencen.innerHTML = '';
            }
        }

        verificarAlertasAlEntrar();
    };

    // ==========================================
    // 9. REPORTES FINANCIEROS Y COSTOS
    // ==========================================
    const renderizarReportesFinancieros = (totalEsperado) => {
        const calcularIngresoDiario = () => {
            const inputFecha = document.getElementById('filtro-fecha-diario');
            const totalDiarioEl = document.getElementById('total-diario');
            if (!inputFecha || !totalDiarioEl) return;
            if (!inputFecha.value) {
                const hoy = new Date();
                const yyyy = hoy.getFullYear();
                const mm = String(hoy.getMonth() + 1).padStart(2, '0');
                const dd = String(hoy.getDate()).padStart(2, '0');
                inputFecha.value = `${yyyy}-${mm}-${dd}`;
            }
            const [year, month, day] = inputFecha.value.split('-');
            const inicioDia = new Date(year, month - 1, day, 0, 0, 0).getTime();
            const finDia = new Date(year, month - 1, day, 23, 59, 59, 999).getTime();

            const totalDia = historialPagos
                .filter(pago => pago.fecha >= inicioDia && pago.fecha <= finDia)
                .reduce((acc, pago) => acc + pago.monto, 0);
            totalDiarioEl.textContent = `$${totalDia.toFixed(2)}`;
        };

        const inputFechaGlobal = document.getElementById('filtro-fecha-diario');
        if (inputFechaGlobal) inputFechaGlobal.addEventListener('change', calcularIngresoDiario);
        
        const totalCobrado = clientes.filter(c => c.estado === 'aldia').reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);
        const totalPendiente = totalEsperado - totalCobrado;

        let totalPagoProveedores = 0;
        cuentas.forEach(cuenta => {
            const costo = costosProveedores[cuenta.plataforma] || 0;
            totalPagoProveedores += costo;
        });

        const gananciaNeta = totalCobrado - totalPagoProveedores;

        const repEsperado = document.getElementById('rep-esperado');
        const repCobrado = document.getElementById('rep-cobrado');
        const repPendiente = document.getElementById('rep-pendiente');
        
        const repProveedores1 = document.getElementById('rep-proveedores');
        const repProveedores2 = document.getElementById('rep-proveedores-2');
        const repGanancia1 = document.getElementById('rep-ganancia');
        const repGanancia2 = document.getElementById('rep-ganancia-2');

        if (repEsperado) repEsperado.textContent = `$${totalEsperado.toFixed(2)}`;
        if (repCobrado) repCobrado.textContent = `$${totalCobrado.toFixed(2)}`;
        if (repPendiente) repPendiente.textContent = `$${totalPendiente.toFixed(2)}`;
        
        if (repProveedores1) repProveedores1.textContent = `$${totalPagoProveedores.toFixed(2)}`;
        if (repProveedores2) repProveedores2.textContent = `$${totalPagoProveedores.toFixed(2)}`;
        if (repGanancia1) repGanancia1.textContent = `$${gananciaNeta.toFixed(2)}`;
        if (repGanancia2) repGanancia2.textContent = `$${gananciaNeta.toFixed(2)}`;

        const contHistorial = document.getElementById('contenedor-historial-meses');
        if (contHistorial) {
            const agrupadoMeses = historialPagos.reduce((acc, pago) => {
                if (!acc[pago.mes]) acc[pago.mes] = 0;
                acc[pago.mes] += pago.monto;
                return acc;
            }, {});
            const nombresMeses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
            const mesesOrdenados = Object.keys(agrupadoMeses).sort((a, b) => b.localeCompare(a)); 

            let htmlHistorial = '';
            mesesOrdenados.forEach(mes => {
                const [year, month] = mes.split('-');
                const nombreMes = nombresMeses[parseInt(month) - 1];
                htmlHistorial += `
                    <div class="plat-card" style="display: flex; justify-content: space-between; align-items: center; border-left: 4px solid #10B981;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="background: rgba(16, 185, 129, 0.1); padding: 12px; border-radius: 12px; color: #10B981; font-size: 1.2rem;">
                                <i class="fa-solid fa-calendar-check"></i>
                            </div>
                            <div>
                                <h3 style="margin: 0; font-size: 1.05rem; color: #1F2937;">${nombreMes} ${year}</h3>
                                <p style="margin: 4px 0 0 0; font-size: 0.8rem; color: #6B7280;">Monto recaudado este mes</p>
                            </div>
                        </div>
                        <h2 style="margin: 0; color: #10B981; font-size: 1.3rem;">$${agrupadoMeses[mes].toFixed(2)}</h2>
                    </div>
                `;
            });
            if (htmlHistorial === '') htmlHistorial = `<p style="grid-column: 1/-1; text-align: center; color: #9CA3AF; padding: 25px;">No hay ingresos registrados en el historial mensual aún.</p>`;
            contHistorial.innerHTML = htmlHistorial;
        }

        const contReportesPlat = document.getElementById('contenedor-reporte-plataformas');
        if (contReportesPlat) {
            contReportesPlat.innerHTML = '';
            const plataformas = [
                { nombre: 'Netflix', color: '#E50914', icono: 'fa-solid fa-play' },
                { nombre: 'Max', color: '#002BE7', icono: 'fa-solid fa-tv' },
                { nombre: 'Spotify Familiar', color: '#1DB954', icono: 'fa-brands fa-spotify' },
                { nombre: 'Spotify Personal', color: '#1ED760', icono: 'fa-brands fa-spotify' },
                { nombre: 'Disney+', color: '#113CCF', icono: 'fa-solid fa-star' },
                { nombre: 'Crunchyroll', color: '#F47521', icono: 'fa-solid fa-fire' },
                { nombre: 'YouTube Premium', color: '#FF0000', icono: 'fa-brands fa-youtube' },
                { nombre: 'Canva', color: '#7D2AE8', icono: 'fa-solid fa-palette' },
                { nombre: 'CapCut', color: '#00F2FE', icono: 'fa-solid fa-video' },
                { nombre: 'Amazon Prime', color: '#00A8E1', icono: 'fa-brands fa-amazon' },
                { nombre: 'IPTV', color: '#14B8A6', icono: 'fa-solid fa-satellite-dish' },
                { nombre: 'ViX', color: '#FF1A75', icono: 'fa-solid fa-video' },
                { nombre: 'Paramount+', color: '#0064FF', icono: 'fa-solid fa-mountain' }
            ];

            let htmlPlat = '';
            plataformas.forEach(plat => {
                const clientesPlat = clientes.filter(c => c.servicioPlataforma === plat.nombre);
                if (clientesPlat.length === 0) return; 

                const platEsperado = clientesPlat.reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);
                const platCobrado = clientesPlat.filter(c => c.estado === 'aldia').reduce((acc, c) => acc + (parseFloat(c.montoPago) || 0), 0);
                const porcentaje = platEsperado === 0 ? 0 : Math.round((platCobrado / platEsperado) * 100);

                htmlPlat += `
                    <div class="plat-card" style="display: flex; flex-direction: column; gap: 10px;">
                        <div style="display: flex; align-items: center; gap: 10px;">
                            <i class="${plat.icono}" style="color: ${plat.color}; font-size: 1.5rem;"></i>
                            <h3 style="margin: 0; font-size: 1.1rem; color: #1F2937;">${plat.nombre}</h3>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-top: 10px; font-size: 0.9rem;">
                            <span style="color: #6B7280;">Cobrado: <strong style="color: #10B981;">$${platCobrado.toFixed(2)}</strong></span>
                            <span style="color: #6B7280;">Total: <strong style="color: #1F2937;">$${platEsperado.toFixed(2)}</strong></span>
                        </div>
                        <div class="progress-bg">
                            <div class="progress-bar" style="width: ${porcentaje}%; background-color: ${plat.color};"></div>
                        </div>
                        <span style="font-size: 0.75rem; text-align: right; color: #9CA3AF; font-weight: 700;">${porcentaje}% Recaudado</span>
                    </div>
                `;
            });
            if (htmlPlat === '') htmlPlat = `<p style="grid-column: 1/-1; text-align: center; color: #9CA3AF; padding: 25px;">No hay ingresos activos registrados.</p>`;
            contReportesPlat.innerHTML = htmlPlat;
        }
        calcularIngresoDiario();
    };

    // ==========================================
    // 10. SERVICIOS ACTIVOS EN INICIO
    // ==========================================
    const contenedorPlataformas = document.getElementById('contenedor-plataformas');
    const renderizarDashboardServicios = () => {
        if (!contenedorPlataformas) return;
        contenedorPlataformas.innerHTML = '';

        const serviciosDef = [
            { nombre: 'Netflix', color: '#E50914', icono: 'fa-solid fa-play' },
            { nombre: 'Max', color: '#002BE7', icono: 'fa-solid fa-tv' },
            { nombre: 'Spotify Familiar', color: '#1DB954', icono: 'fa-brands fa-spotify' },
            { nombre: 'Spotify Personal', color: '#1ED760', icono: 'fa-brands fa-spotify' },
            { nombre: 'Disney+', color: '#113CCF', icono: 'fa-solid fa-star' },
            { nombre: 'Crunchyroll', color: '#F47521', icono: 'fa-solid fa-fire' },
            { nombre: 'YouTube Premium', color: '#FF0000', icono: 'fa-brands fa-youtube' },
            { nombre: 'Canva', color: '#7D2AE8', icono: 'fa-solid fa-palette' },
            { nombre: 'CapCut', color: '#00F2FE', icono: 'fa-solid fa-video' },
            { nombre: 'Amazon Prime', color: '#00A8E1', icono: 'fa-brands fa-amazon' },
            { nombre: 'IPTV', color: '#14B8A6', icono: 'fa-solid fa-satellite-dish' },
            { nombre: 'ViX', color: '#FF1A75', icono: 'fa-solid fa-video' },
            { nombre: 'Paramount+', color: '#0064FF', icono: 'fa-solid fa-mountain' }
        ];

        serviciosDef.forEach(serv => {
            const madresCount = cuentas.filter(c => c.plataforma === serv.nombre).length;
            const perfilesCount = clientes.filter(c => c.servicioPlataforma === serv.nombre).length;

            const tarjeta = document.createElement('div');
            tarjeta.className = 'plat-card';
            tarjeta.innerHTML = `
                <div class="plat-card__header">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <i class="${serv.icono}" style="color: ${serv.color}; font-size: 1.5rem;"></i>
                        <h3 style="margin: 0; font-size: 1.1rem; color: #1F2937;">${serv.nombre}</h3>
                    </div>
                    <span class="plat-card__tag" style="background-color: ${serv.color}; color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.7rem;">Activo</span>
                </div>
                <div class="plat-card__info" style="margin-top: 12px; color: #6B7280; font-size: 0.85rem;">
                    <p style="margin: 0 0 4px 0;">Cuentas Madre: <strong style="color: #1F2937;">${madresCount}</strong></p>
                    <p style="margin: 0;">Perfiles Vendidos: <strong style="color: #1F2937;">${perfilesCount}</strong></p>
                </div>
            `;
            contenedorPlataformas.appendChild(tarjeta);
        });
    };

    // ==========================================
    // 11. GESTIÓN DE CUENTAS MADRE
    // ==========================================
    const guardarYRenderizarCuentas = () => {
        guardarNube();
        
        const filtroCuentasActivo = document.querySelector('#vista-cuentas .btn-filtro.active');
        const valFiltroCuentas = filtroCuentasActivo ? filtroCuentasActivo.getAttribute('data-filtro') : 'Todas';
        const textoBusqCuentas = document.getElementById('buscador-cuentas')?.value || '';
        
        if (textoBusqCuentas.trim() !== '') {
            renderizarCuentas(textoBusqCuentas);
        } else {
            renderizarCuentas(valFiltroCuentas === 'Todas' ? '' : valFiltroCuentas);
        }
        
        actualizarDashboard();
    };

    const renderizarCuentas = function(filtro) {
        filtro = filtro || '';
        const grid = document.querySelector('#vista-cuentas .grid-cuentas');
        if (!grid) return;
        grid.innerHTML = '';

        const filtradas = cuentas.filter(function(c) {
            return c.correo.toLowerCase().indexOf(filtro.toLowerCase()) !== -1 || c.plataforma.toLowerCase().indexOf(filtro.toLowerCase()) !== -1;
        });

        if (filtradas.length === 0) {
            grid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: rgba(255,255,255,0.5); padding: 25px;">No hay cuentas con este filtro.</p>';
            return;
        }

        filtradas.forEach(function(c) {
            const bgGradient = c.estado === 'vencida' ? 'bg-gradient-danger' : 
                               c.estado === 'por-vencer' ? 'bg-gradient-warning' : 
                               'bg-gradient-success';
            const badgeTexto = c.estado === 'vencida' ? 'Vencida' : 
                               c.estado === 'por-vencer' ? 'Por Vencer' : 'Al Día';

            let fechaText = "Sin fecha configurada";
            if(c.fechaVencimiento) {
                const f = new Date(c.fechaVencimiento);
                let dStr = String(f.getDate()); if (dStr.length === 1) dStr = '0' + dStr;
                let mStr = String(f.getMonth() + 1); if (mStr.length === 1) mStr = '0' + mStr;
                fechaText = dStr + '/' + mStr + '/' + f.getFullYear();
            }

            const html = `
                <div class="cuenta-card ${bgGradient}">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.18);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div class="glass-icon-circle">
                                <i class="${c.icono}"></i>
                            </div>
                            <h3 style="margin: 0; font-size: 1.15rem; color: #fff; font-weight: 800;">${c.plataforma}</h3>
                        </div>
                        <span style="background: rgba(0,0,0,0.3); padding: 4px 10px; border-radius: 8px; font-size: 0.7rem; font-weight: 800; color: #fff; border: 1px solid rgba(255,255,255,0.25); text-transform: uppercase;">${badgeTexto}</span>
                    </div>
                    <div style="color: rgba(255,255,255,0.9); font-size: 0.88rem; display: flex; flex-direction: column; gap: 8px;">
                        <p style="margin: 0; font-weight: 500;">Correo: <strong style="color: #fff; display: block; font-size: 0.95rem; margin-top: 2px; word-break: break-all;">${c.correo}</strong></p>
                        <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 6px;">
                            <p style="margin: 0; font-weight: 500;">Vencimiento:<br><strong style="color: #fff; font-weight: 700;">${fechaText}</strong></p>
                            <p style="margin: 0; text-align: right; font-weight: 500;">Ocupados:<br><strong style="color: #fff; font-weight: 700;">${c.perfilesOcupados || 0} / ${c.perfilesMax}</strong></p>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 16px; border-top: 1px solid rgba(255,255,255,0.18); padding-top: 14px;">
                        <button class="glass-btn" type="button" onclick="abrirModalSubcuentas(${c.id})"><i class="fa-solid fa-users"></i> Gestionar</button>
                        <div style="display: flex; gap: 8px;">
                            <button class="glass-btn" type="button" onclick="abrirModalEditarCuenta(${c.id})" style="padding: 8px 12px;"><i class="fa-solid fa-pen"></i></button>
                            <button class="glass-btn" type="button" onclick="abrirModalEliminar(${c.id})" style="padding: 8px 12px; background: rgba(239,68,68,0.3); border-color: rgba(239,68,68,0.5); color: #ff9999;"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                </div>
            `;
            const wrapper = document.createElement('div');
            wrapper.innerHTML = html;
            grid.appendChild(wrapper.firstElementChild);
        });
    };

    const inputBuscadorCuentas = document.getElementById('buscador-cuentas');
    const botonesFiltroCuentas = document.querySelectorAll('#vista-cuentas .btn-filtro');
    if (inputBuscadorCuentas) {
        inputBuscadorCuentas.addEventListener('input', (e) => {
            renderizarCuentas(e.target.value);
            botonesFiltroCuentas.forEach(b => b.classList.remove('active'));
        });
    }

    botonesFiltroCuentas.forEach(boton => {
        boton.addEventListener('click', () => {
            botonesFiltroCuentas.forEach(b => b.classList.remove('active'));
            boton.classList.add('active');
            if (inputBuscadorCuentas) inputBuscadorCuentas.value = '';
            const filtroVal = boton.getAttribute('data-filtro');
            renderizarCuentas(filtroVal === 'Todas' ? '' : filtroVal);
        });
    });

    const modalAgregarId = 'modal-agregar-cuenta';
    const formAgregarCuenta = document.getElementById('form-agregar-cuenta');
    document.getElementById('btn-agregar-cuenta')?.addEventListener('click', () => toggleModal(modalAgregarId, true));
    document.getElementById('cerrar-modal-agregar')?.addEventListener('click', () => toggleModal(modalAgregarId, false));
    
    const selectNuevoPlat = document.getElementById('nuevo-plataforma');
    const inputNuevoPerfiles = document.getElementById('nuevo-perfiles');
    if(selectNuevoPlat && inputNuevoPerfiles) {
        selectNuevoPlat.addEventListener('change', (e) => {
            if (e.target.value === 'Spotify Personal') {
                inputNuevoPerfiles.value = 1;
                inputNuevoPerfiles.setAttribute('readonly', 'true');
            } else {
                inputNuevoPerfiles.removeAttribute('readonly');
            }
        });
    }

    if (formAgregarCuenta) {
        formAgregarCuenta.addEventListener('submit', (e) => {
            e.preventDefault();
            const inputCorreoObj = document.getElementById('nuevo-correo');
            const correoGuardado = inputCorreoObj ? inputCorreoObj.value.trim() : 'Sin Correo';
            const plataforma = document.getElementById('nuevo-plataforma').value;
            const estadoInicial = document.getElementById('nuevo-estado')?.value || 'aldia';
            
            let perfilesMax = parseInt(document.getElementById('nuevo-perfiles').value) || 5;
            if (plataforma === 'Spotify Personal') perfilesMax = 1; 

            const inputFecha = document.getElementById('nuevo-vencimiento-cuenta')?.value;
            let fechaManual = null;
            if(inputFecha) {
                const [year, month, day] = inputFecha.split('-');
                fechaManual = new Date(year, month - 1, day, 23, 59, 59).getTime();
            }

            let icono = 'fa-solid fa-play'; let color = '#E50914';
            if (plataforma.includes('Spotify')) { icono = 'fa-brands fa-spotify'; color = '#1DB954'; }
            else if (plataforma === 'Max') { icono = 'fa-solid fa-tv'; color = '#002BE7'; }
            else if (plataforma === 'Disney+') { icono = 'fa-solid fa-star'; color = '#113CCF'; }
            else if (plataforma === 'Crunchyroll') { icono = 'fa-solid fa-fire'; color = '#F47521'; }
            else if (plataforma === 'YouTube Premium') { icono = 'fa-brands fa-youtube'; color = '#FF0000'; }
            else if (plataforma === 'Canva') { icono = 'fa-solid fa-palette'; color = '#7D2AE8'; }
            else if (plataforma === 'CapCut') { icono = 'fa-solid fa-video'; color = '#00F2FE'; }
            else if (plataforma === 'Amazon Prime') { icono = 'fa-brands fa-amazon'; color = '#00A8E1'; }
            else if (plataforma === 'IPTV') { icono = 'fa-solid fa-satellite-dish'; color = '#14B8A6'; }
            else if (plataforma === 'ViX') { icono = 'fa-solid fa-video'; color = '#FF1A75'; }
            else if (plataforma === 'Paramount+') { icono = 'fa-solid fa-mountain'; color = '#0064FF'; }

            const subcuentasIniciales = [];
            for (let i = 0; i < perfilesMax; i++) subcuentasIniciales.push({ nombre: '', correoPerfil: '' });

            const nuevaCuenta = {
                id: Date.now(), plataforma: plataforma, icono: icono, color: color,
                correo: correoGuardado, perfilesMax: perfilesMax, perfilesOcupados: 0,
                estado: estadoInicial,
                fechaVencimiento: fechaManual, subcuentas: subcuentasIniciales
            };

            cuentas.push(nuevaCuenta);
            guardarYRenderizarCuentas(); 
            toggleModal(modalAgregarId, false);
            formAgregarCuenta.reset();
            mostrarNotificacion('¡Cuenta Madre guardada con éxito!');
        });
    }

    let cuentaAEliminar = null;
    const modalEliminarId = 'modal-eliminar';
    window.abrirModalEliminar = function(id) { cuentaAEliminar = id; toggleModal(modalEliminarId, true); };
    document.getElementById('btn-cancelar-eliminar')?.addEventListener('click', () => { toggleModal(modalEliminarId, false); cuentaAEliminar = null; });
    document.getElementById('btn-confirmar-eliminar')?.addEventListener('click', () => {
        if (cuentaAEliminar) {
            cuentas = cuentas.filter(c => c.id !== cuentaAEliminar);
            guardarYRenderizarCuentas();
            toggleModal(modalEliminarId, false);
            mostrarNotificacion('Cuenta eliminada', 'info');
        }
    });

    let cuentaEnEdicionId = null;
    const modalSubId = 'modal-subcuentas';
    document.getElementById('cerrar-modal-sub')?.addEventListener('click', () => toggleModal(modalSubId, false));

    window.abrirModalSubcuentas = function(idCuenta) {
        const cuenta = cuentas.find(c => c.id === idCuenta);
        if (!cuenta) return;
        cuentaEnEdicionId = cuenta.id;
        toggleModal(modalSubId, true);
        const correoRef = document.getElementById('modal-correo-ref');
        if (correoRef) correoRef.textContent = `${cuenta.plataforma} — ${cuenta.correo}`;

        if (!cuenta.subcuentas || cuenta.subcuentas.length !== cuenta.perfilesMax) {
            cuenta.subcuentas = [];
            for (let i = 1; i <= cuenta.perfilesMax; i++) cuenta.subcuentas.push({ nombre: '', correoPerfil: '' });
        }

        const contenedorListaPerfiles = document.getElementById('contenedor-lista-perfiles');
        if (contenedorListaPerfiles) {
            contenedorListaPerfiles.innerHTML = '';
            cuenta.subcuentas.forEach((sub, index) => {
                const perfilDiv = document.createElement('div');
                perfilDiv.className = 'perfil-item-box';
                perfilDiv.style.cssText = 'background: #F9FAFB; padding: 12px; border-radius: 12px; border: 1px solid #E5E7EB; display: flex; flex-direction: column; gap: 8px;';
                
                perfilDiv.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 700; font-size: 0.85rem; color: #374151;">Perfil ${index + 1}</span>
                        <span style="font-size: 0.75rem; color: #9CA3AF;">Slot ${index + 1} de ${cuenta.perfilesMax}</span>
                    </div>
                    <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                        <input type="text" class="input-nombre-perfil" placeholder="Nombre del cliente" value="${sub.nombre || ''}" style="flex: 1; min-width: 140px; padding: 8px; border-radius: 8px; border: 1px solid #D1D5DB; font-size: 0.85rem; color: #1F2937; outline: none;">
                        <input type="text" class="input-correo-perfil" placeholder="Correo o PIN" value="${sub.correoPerfil || ''}" style="flex: 1; min-width: 140px; padding: 8px; border-radius: 8px; border: 1px solid #D1D5DB; font-size: 0.85rem; color: #1F2937; outline: none;">
                    </div>
                `;
                contenedorListaPerfiles.appendChild(perfilDiv);
            });
        }
    };

    document.getElementById('btn-guardar-cambios-subcuentas')?.addEventListener('click', () => {
        if (!cuentaEnEdicionId) return;
        const cuenta = cuentas.find(c => c.id === cuentaEnEdicionId);
        if (!cuenta) return;

        const contenedorListaPerfiles = document.getElementById('contenedor-lista-perfiles');
        const itemsPerfiles = contenedorListaPerfiles.querySelectorAll('.perfil-item-box');
        let ocupadosCount = 0;

        cuenta.subcuentas = [];
        itemsPerfiles.forEach(item => {
            const cajaNombre = item.querySelector('.input-nombre-perfil');
            const cajaCorreo = item.querySelector('.input-correo-perfil');
            const nombreGuardado = cajaNombre ? cajaNombre.value.trim() : '';
            const correoPerfilGuardado = cajaCorreo ? cajaCorreo.value.trim() : '';
            
            cuenta.subcuentas.push({ nombre: nombreGuardado, correoPerfil: correoPerfilGuardado });
            if (nombreGuardado !== '') ocupadosCount++;
        });

        cuenta.perfilesOcupados = ocupadosCount;
        guardarYRenderizarCuentas();
        toggleModal(modalSubId, false);
        mostrarNotificacion('Perfiles actualizados', 'success');
    });

    const modalEditarCuentaId = 'modal-editar-cuenta';
    const formEditarCuenta = document.getElementById('form-editar-cuenta');
    document.getElementById('cerrar-modal-editar-cuenta')?.addEventListener('click', () => toggleModal(modalEditarCuentaId, false));

    window.abrirModalEditarCuenta = function(id) {
        const cuenta = cuentas.find(c => c.id === id);
        if (!cuenta) return;
        document.getElementById('edit-cuenta-id').value = cuenta.id;
        document.getElementById('edit-cuenta-correo').value = cuenta.correo;

        if (cuenta.fechaVencimiento) {
            const fd = new Date(cuenta.fechaVencimiento);
            const yyyy = fd.getFullYear();
            const mm = String(fd.getMonth() + 1).padStart(2, '0');
            const dd = String(fd.getDate()).padStart(2, '0');
            const inputVenc = document.getElementById('edit-cuenta-vencimiento');
            if(inputVenc) inputVenc.value = `${yyyy}-${mm}-${dd}`;
        }

        toggleModal(modalEditarCuentaId, true);
    };

    const modalNotificacionId = 'modal-notificacion-masiva';
    document.getElementById('cerrar-modal-notificacion')?.addEventListener('click', () => toggleModal(modalNotificacionId, false));

    if (formEditarCuenta) {
        formEditarCuenta.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = parseInt(document.getElementById('edit-cuenta-id').value);
            const nuevoCorreo = document.getElementById('edit-cuenta-correo').value.trim();
            const fechaInput = document.getElementById('edit-cuenta-vencimiento')?.value;

            const cuenta = cuentas.find(c => c.id === id);
            if (!cuenta) return;

            const correoViejo = cuenta.correo;
            cuenta.correo = nuevoCorreo;
            
            if(fechaInput) {
                const [year, month, day] = fechaInput.split('-');
                cuenta.fechaVencimiento = new Date(year, month - 1, day, 23, 59, 59).getTime();
            }

            guardarYRenderizarCuentas(); 

            const clientesAfectados = clientes.filter(c => c.servicioCorreo.toLowerCase() === correoViejo.toLowerCase() && c.servicioPlataforma === cuenta.plataforma);
            
            if (clientesAfectados.length > 0) {
                clientesAfectados.forEach(c => c.servicioCorreo = nuevoCorreo);
                guardarYRenderizarClientes();
                toggleModal(modalEditarCuentaId, false);
                abrirModalNotificacionMasiva(clientesAfectados, cuenta.plataforma, nuevoCorreo);
            } else {
                toggleModal(modalEditarCuentaId, false);
                mostrarNotificacion('Cuenta actualizada. No hay clientes vinculados a este correo.', 'success');
            }
        });
    }

    window.abrirModalNotificacionMasiva = function(clientesAfectados, plataforma, nuevoCorreo) {
        const contenedor = document.getElementById('lista-clientes-notificar');
        if (!contenedor) return;
        contenedor.innerHTML = '';
        
        clientesAfectados.forEach(c => {
            const mensaje = `Hola ${c.nombre}!\n\nTe informamos que por motivos de mantenimiento hemos actualizado el correo de acceso para tu cuenta de *${plataforma}*:\n\n• *Nuevo Correo:* ${nuevoCorreo}\n• *Contraseña/PIN:* ${c.contrasena || 'La misma que ya tenías'}\n• *Perfil:* ${c.servicioDetalle}\n\nPor favor, utiliza este nuevo correo para iniciar sesión a partir de ahora. ¡Gracias por tu comprensión!`;
            const urlWa = `https://api.whatsapp.com/send?phone=${c.telefono}&text=${encodeURIComponent(mensaje)}`;
            
            const item = document.createElement('div');
            item.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: #F9FAFB; padding: 12px; border-radius: 10px; border: 1px solid #E5E7EB;';
            item.innerHTML = `
                <div>
                    <strong style="color: #1F2937; display: block; font-size: 0.9rem;">${c.nombre}</strong>
                    <span style="color: #6B7280; font-size: 0.8rem;">Perfil: ${c.servicioDetalle}</span>
                </div>
                <a href="${urlWa}" target="_blank" onclick="this.style.backgroundColor='#E5E7EB'; this.style.color='#9CA3AF'; this.innerHTML='<i class=\\'fa-solid fa-check\\'></i> Listo';" style="background: #25D366; color: white; padding: 8px 12px; border-radius: 8px; text-decoration: none; font-size: 0.85rem; font-weight: bold; display: flex; align-items: center; gap: 6px; transition: 0.2s;">
                    <i class="fa-brands fa-whatsapp"></i> Notificar
                </a>
            `;
            contenedor.appendChild(item);
        });
        toggleModal(modalNotificacionId, true);
    };

    // ==========================================
    // 12. GESTIÓN DE CLIENTES
    // ==========================================
    const guardarYRenderizarClientes = () => {
        guardarNube();
        const filtroActivo = document.querySelector('#vista-clientes .btn-filtro.active');
        const filtroVal = filtroActivo ? filtroActivo.getAttribute('data-filtro') : 'todos';
        renderizarClientes(filtroVal);
        actualizarDashboard();
    };

    const renderizarClientes = (filtroEstado = 'todos') => {
        verificarVencimientosClientes();
        const grid = document.querySelector('#vista-clientes .grid-clientes'); 
        if (!grid) return;
        
        const textoBusqueda = (document.getElementById('buscador-clientes')?.value || '').toLowerCase();
        
        let filtrados = clientes.filter(c => {
            const coincideBusqueda = c.nombre.toLowerCase().includes(textoBusqueda) || 
                                     c.servicioCorreo.toLowerCase().includes(textoBusqueda) ||
                                     (c.correoPersonal && c.correoPersonal.toLowerCase().includes(textoBusqueda));
            const coincideEstado = filtroEstado === 'todos' || 
                                  (filtroEstado === 'aldia' && c.estado === 'aldia') || 
                                  (filtroEstado === 'vencidos' && (c.estado === 'moroso' || c.estado === 'vence-hoy'));
            return coincideBusqueda && coincideEstado;
        });

        if (filtrados.length === 0) {
            grid.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: #9CA3AF; padding: 25px;">No se encontraron clientes registrados.</p>`;
            return;
        }
        
        grid.innerHTML = filtrados.map(c => generarHTMLTarjetaCliente(c)).join('');
    };

    const inputBuscadorClientes = document.getElementById('buscador-clientes');
    const botonesFiltroClientes = document.querySelectorAll('#vista-clientes .btn-filtro');
    if (inputBuscadorClientes) {
        inputBuscadorClientes.addEventListener('input', () => {
            const activo = document.querySelector('#vista-clientes .btn-filtro.active');
            renderizarClientes(activo ? activo.getAttribute('data-filtro') : 'todos');
        });
    }
    botonesFiltroClientes.forEach(boton => {
        boton.addEventListener('click', () => {
            botonesFiltroClientes.forEach(b => b.classList.remove('active'));
            boton.classList.add('active');
            if (inputBuscadorClientes) inputBuscadorClientes.value = '';
            renderizarClientes(boton.getAttribute('data-filtro'));
        });
    });

    const selectPlataforma = document.getElementById('cliente-plataforma');
    const grupoCorreoPersonal = document.getElementById('grupo-correo-personal');
    const grupoEnlaceIptv = document.getElementById('grupo-enlace-iptv'); 
    const inputContrasena = document.getElementById('cliente-contrasena');
    const inputCorreoBase = document.getElementById('cliente-correo');

    const adaptarFormularioSegunPlataforma = (platVal) => {
        if (!inputContrasena || !inputCorreoBase) return;

        if (grupoCorreoPersonal) grupoCorreoPersonal.style.display = 'none';
        if (grupoEnlaceIptv) grupoEnlaceIptv.style.display = 'none';
        
        inputCorreoBase.type = 'email'; 

        if (platVal.includes('Spotify')) {
            if (grupoCorreoPersonal) grupoCorreoPersonal.style.display = 'flex';
            inputContrasena.required = false;
            inputContrasena.placeholder = 'No requiere contraseña (Invitación)';
            inputCorreoBase.placeholder = 'Correo Admin / Cuenta Madre';
        } else if (platVal === 'Canva' || platVal === 'CapCut') {
            inputContrasena.required = false;
            inputContrasena.placeholder = 'No requiere contraseña (Invitación por correo)';
            inputCorreoBase.placeholder = 'Correo personal o vinculado del cliente';
        } else if (platVal === 'IPTV') {
            if (grupoEnlaceIptv) grupoEnlaceIptv.style.display = 'flex';
            inputContrasena.required = true;
            inputContrasena.placeholder = 'Contraseña del IPTV';
            inputCorreoBase.type = 'text'; 
            inputCorreoBase.placeholder = 'Usuario del IPTV';
        } else {
            inputContrasena.required = true;
            inputContrasena.placeholder = 'Contraseña o PIN del perfil';
            inputCorreoBase.placeholder = 'correo.vinculado@gmail.com';
        }
    };

    if (selectPlataforma) {
        selectPlataforma.addEventListener('change', (e) => {
            adaptarFormularioSegunPlataforma(e.target.value);
        });
    }

    const modalClienteId = 'modal-cliente';
    const formCliente = document.getElementById('form-cliente');
    
    document.getElementById('btn-agregar-cliente')?.addEventListener('click', () => {
        if (formCliente) formCliente.reset();
        document.getElementById('cliente-id').value = '';
        document.getElementById('titulo-modal-cliente').textContent = 'Agregar Cliente';
        
        const defaultDate = new Date();
        defaultDate.setDate(defaultDate.getDate() + 28);
        const yyyy = defaultDate.getFullYear();
        const mm = String(defaultDate.getMonth() + 1).padStart(2, '0');
        const dd = String(defaultDate.getDate()).padStart(2, '0');
        document.getElementById('cliente-fecha-vencimiento').value = `${yyyy}-${mm}-${dd}`;

        if (selectPlataforma) adaptarFormularioSegunPlataforma(selectPlataforma.value);
        toggleModal(modalClienteId, true);
    });

    document.getElementById('cerrar-modal-cliente')?.addEventListener('click', () => toggleModal(modalClienteId, false));

    window.abrirModalCliente = function(id) {
        const cliente = clientes.find(c => c.id === id);
        if (!cliente) return;
        
        document.getElementById('cliente-id').value = cliente.id;
        document.getElementById('cliente-nombre').value = cliente.nombre;
        document.getElementById('cliente-estado').value = (cliente.estado === 'moroso' || cliente.estado === 'vence-hoy') ? 'moroso' : 'aldia';
        document.getElementById('cliente-monto').value = cliente.montoPago || '';
        document.getElementById('cliente-plataforma').value = cliente.servicioPlataforma;
        document.getElementById('cliente-detalle').value = cliente.servicioDetalle;
        document.getElementById('cliente-correo').value = cliente.servicioCorreo;
        
        document.getElementById('cliente-telefono').value = cliente.telefono || '';
        document.getElementById('cliente-metodo-pago').value = cliente.metodoPago || 'Binance';
        document.getElementById('cliente-contrasena').value = cliente.contrasena || '';
        
        const inputPersonal = document.getElementById('cliente-correo-personal');
        if (inputPersonal) inputPersonal.value = cliente.correoPersonal || '';

        const inputEnlace = document.getElementById('cliente-enlace');
        if (inputEnlace) inputEnlace.value = cliente.enlaceIptv || '';

        adaptarFormularioSegunPlataforma(cliente.servicioPlataforma);

        if (cliente.fechaVencimiento) {
            const fd = new Date(cliente.fechaVencimiento);
            const yyyy = fd.getFullYear();
            const mm = String(fd.getMonth() + 1).padStart(2, '0');
            const dd = String(fd.getDate()).padStart(2, '0');
            document.getElementById('cliente-fecha-vencimiento').value = `${yyyy}-${mm}-${dd}`;
        }

        document.getElementById('titulo-modal-cliente').textContent = 'Editar Cliente';
        toggleModal(modalClienteId, true);
    };

    if (formCliente) {
        formCliente.addEventListener('submit', (e) => {
            e.preventDefault();
            const idForm = document.getElementById('cliente-id').value;
            const fechaInput = document.getElementById('cliente-fecha-vencimiento').value;
            const [year, month, day] = fechaInput.split('-');
            const fechaManual = new Date(year, month - 1, day, 23, 59, 59).getTime();

            let telefono = document.getElementById('cliente-telefono').value.replace(/\D/g, ''); 
            if (telefono.startsWith('0') && telefono.length === 11) {
                telefono = '58' + telefono.substring(1);
            } else if (telefono.length === 10 && !telefono.startsWith('58')) {
                telefono = '58' + telefono;
            }

            const metodoPago = document.getElementById('cliente-metodo-pago').value;
            const contrasena = document.getElementById('cliente-contrasena').value.trim();
            const plataforma = document.getElementById('cliente-plataforma').value;

            const inputPersonal = document.getElementById('cliente-correo-personal');
            const correoPersonal = (plataforma.includes('Spotify') && inputPersonal) ? inputPersonal.value.trim() : '';

            const inputEnlace = document.getElementById('cliente-enlace');
            const enlaceIptv = (plataforma === 'IPTV' && inputEnlace) ? inputEnlace.value.trim() : '';

            const datosCliente = {
                id: idForm ? parseInt(idForm) : Date.now(),
                nombre: document.getElementById('cliente-nombre').value.trim(),
                estado: 'aldia', 
                montoPago: parseFloat(document.getElementById('cliente-monto').value) || 0,
                servicioPlataforma: plataforma,
                servicioDetalle: document.getElementById('cliente-detalle').value.trim(),
                servicioCorreo: document.getElementById('cliente-correo').value.trim(),
                correoPersonal: correoPersonal,
                enlaceIptv: enlaceIptv, 
                fechaVencimiento: fechaManual,
                telefono: telefono,
                metodoPago: metodoPago,
                contrasena: contrasena,
                estadoAviso: idForm ? (clientes.find(c => c.id === parseInt(idForm))?.estadoAviso || 'pendiente') : 'pendiente'
            };

            if (idForm) {
                const index = clientes.findIndex(c => c.id === parseInt(idForm));
                if (index > -1) { clientes[index] = datosCliente; }
                
                historialPagos.forEach(pago => {
                    if (pago.clienteId === parseInt(idForm)) {
                        pago.monto = datosCliente.montoPago;
                        pago.plataforma = datosCliente.servicioPlataforma;
                    }
                });
            } else {
                clientes.push(datosCliente);
                registrarTransaccionHistorial(datosCliente.montoPago, datosCliente.servicioPlataforma, datosCliente.id);
            }

            guardarYRenderizarClientes();
            toggleModal(modalClienteId, false);
            mostrarNotificacion('¡Cliente guardado! Abriendo WhatsApp...', 'success');

            const fechaFormateada = new Date(fechaManual).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
            
            let mensajeWa = ''; 
            const textoContrasena = datosCliente.contrasena !== '' ? `\n• *Contraseña/PIN:* ${datosCliente.contrasena}` : '';

            if (plataforma.includes('Spotify')) {
                mensajeWa = `Hola ${datosCliente.nombre}!\n\nAquí tienes los detalles de tu cuenta de *${plataforma}*:\n\n• *Tu Correo (Invitación):* ${datosCliente.correoPersonal}\n• *Plan:* ${datosCliente.servicioDetalle}${textoContrasena}\n\n• *Tu cuenta vence el:* ${fechaFormateada}\n\n¡Gracias por tu compra!`;
            } else if (plataforma === 'Canva') {
                mensajeWa = `Hola ${datosCliente.nombre}!\n\nAquí tienes los detalles de tu acceso a *${plataforma}*:\n\n• *Correo de Invitación:* ${datosCliente.servicioCorreo}\n• *Plan/Equipo:* ${datosCliente.servicioDetalle}${textoContrasena}\n\n• *Tu cuenta vence el:* ${fechaFormateada}\n\n¡Gracias por tu compra! Disfruta tu plataforma.`;
            } else if (plataforma === 'IPTV') {
                const textoEnlace = datosCliente.enlaceIptv !== '' ? `\n• *Enlace/App:* ${datosCliente.enlaceIptv}` : '';
                mensajeWa = `Hola ${datosCliente.nombre}!\n\nAquí tienes los datos de acceso de tu cuenta de *IPTV*:\n\n• *Usuario:* ${datosCliente.servicioCorreo}${textoContrasena}${textoEnlace}\n• *Dispositivos/Detalle:* ${datosCliente.servicioDetalle}\n\n• *Tu cuenta vence el:* ${fechaFormateada}\n\n¡Gracias por tu compra! Disfruta tu contenido.`;
            } else {
                mensajeWa = `Hola ${datosCliente.nombre}!\n\nAquí tienes los datos de acceso de tu cuenta de *${datosCliente.servicioPlataforma}*:\n\n• *Correo:* ${datosCliente.servicioCorreo}${textoContrasena}\n• *Perfil Asignado:* ${datosCliente.servicioDetalle}\n\n• *Tu cuenta vence el:* ${fechaFormateada}\n\n¡Gracias por tu compra! Disfruta tu contenido.`;
            }
            
            const urlWa = `https://api.whatsapp.com/send?phone=${datosCliente.telefono}&text=${encodeURIComponent(mensajeWa)}`;
            window.open(urlWa, '_blank');
        });
    }

    let clienteAEliminarId = null;
    const modalEliminarClienteId = 'modal-eliminar-cliente';
    window.eliminarCliente = function(id) { clienteAEliminarId = id; toggleModal(modalEliminarClienteId, true); };
    document.getElementById('btn-cancelar-eliminar-cliente')?.addEventListener('click', () => { toggleModal(modalEliminarClienteId, false); clienteAEliminarId = null; });
    document.getElementById('btn-confirmar-eliminar-cliente')?.addEventListener('click', () => {
        if (clienteAEliminarId !== null) {
            clientes = clientes.filter(c => c.id !== clienteAEliminarId);
            historialPagos = historialPagos.filter(pago => pago.clienteId !== clienteAEliminarId);
            guardarYRenderizarClientes();
            toggleModal(modalEliminarClienteId, false);
            clienteAEliminarId = null;
            mostrarNotificacion('Cliente eliminado', 'info');
        }
    });

    let clientePagoId = null;
    const modalPagoId = 'modal-pago';
    window.abrirModalPago = function(id) { clientePagoId = id; toggleModal(modalPagoId, true); };
    document.getElementById('btn-cancelar-pago')?.addEventListener('click', () => { toggleModal(modalPagoId, false); clientePagoId = null; });

    document.getElementById('btn-confirmar-pago')?.addEventListener('click', () => {
        if (clientePagoId) {
            const index = clientes.findIndex(c => c.id === clientePagoId);
            if (index > -1) {
                let baseDate = new Date();
                if (clientes[index].fechaVencimiento > Date.now()) baseDate = new Date(clientes[index].fechaVencimiento);
                baseDate.setDate(baseDate.getDate() + 28);
                
                clientes[index].estado = 'aldia';
                clientes[index].fechaVencimiento = baseDate.setHours(23, 59, 59, 999);
                
                registrarTransaccionHistorial(clientes[index].montoPago, clientes[index].servicioPlataforma, clientes[index].id);
                guardarYRenderizarClientes();
            }
            toggleModal(modalPagoId, false);
            clientePagoId = null;
            mostrarNotificacion('¡Pago registrado con éxito!');
        }
    });

    window.enviarRecordatorio = function(id) {
        const index = clientes.findIndex(c => c.id === id);
        if (index > -1) {
            const c = clientes[index];
            const estaMoroso = c.estado === 'moroso';
            const mensaje = `Hola ${c.nombre}!\n\nTe escribimos de *Streaming Mundial* para recordarte que tu suscripción de *${c.servicioPlataforma}* ${estaMoroso ? 'ha vencido' : 'vence el día de hoy'}.\n\nPuedes renovar tu servicio realizando el pago de *$${parseFloat(c.montoPago).toFixed(2)}* vía *${c.metodoPago || 'tu método habitual'}*.\n\n¡Quedamos atentos para renovar tu acceso!`;
            
            clientes[index].estadoAviso = 'avisado';
            guardarYRenderizarClientes();
            
            const urlWa = `https://api.whatsapp.com/send?phone=${c.telefono}&text=${encodeURIComponent(mensaje)}`;
            window.open(urlWa, '_blank');
            mostrarNotificacion('Recordatorio enviado', 'info');
        }
    };

    // ==========================================
    // 13. VISTA CONFIGURACIÓN / AJUSTES DE COSTOS
    // ==========================================
    const renderizarVistaCostos = () => {
        const contenedor = document.getElementById('contenedor-costos');
        if (!contenedor) return;
        
        const plataformas = ['Netflix', 'Max', 'Spotify Familiar', 'Spotify Personal', 'Disney+', 'Crunchyroll', 'YouTube Premium', 'Canva', 'CapCut', 'Amazon Prime', 'IPTV', 'ViX', 'Paramount+'];
        contenedor.innerHTML = '';
        
        contenedor.style.display = 'grid';
        contenedor.style.gridTemplateColumns = 'repeat(auto-fit, minmax(200px, 1fr))';
        contenedor.style.gap = '20px';
        
        plataformas.forEach(plat => {
            const costoActual = costosProveedores[plat] || 0;
            contenedor.innerHTML += `
                <div class="form-group" style="background: rgba(255, 255, 255, 0.05); padding: 18px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.12); box-shadow: inset 0 1px 0 rgba(255,255,255,0.1);">
                    <label style="font-size: 0.9rem; color: rgba(255,255,255,0.9); margin-bottom: 10px; display: block; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px;">${plat}</label>
                    <div class="input-icon-wrapper">
                        <i class="fa-solid fa-dollar-sign"></i>
                        <input type="number" step="0.01" min="0" id="costo-${plat.replace(/\s+/g, '')}" class="input-costo" data-plat="${plat}" value="${costoActual}">
                    </div>
                </div>
            `;
        });
    };

    document.getElementById('btn-guardar-costos')?.addEventListener('click', () => {
        document.querySelectorAll('.input-costo').forEach(input => {
            const plat = input.getAttribute('data-plat');
            costosProveedores[plat] = parseFloat(input.value) || 0;
        });
        guardarNube();           
        actualizarDashboard();   
        mostrarNotificacion('Costos guardados y calculados', 'success');
    });

    escucharNubeEnTiempoReal();
});