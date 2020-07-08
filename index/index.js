function inArray(arr, key, val) {
  for (let i = 0; i < arr.length; i++) {
    if (arr[i][key] === val) {
      return i;
    }
  }
  return -1;
}

function sleep(delay) {
  var start = (new Date()).getTime();
  while ((new Date()).getTime() - start < delay) {
    continue;
  }
}
// ArrayBuffer转为字符串，参数为ArrayBuffer对象
function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint8Array(buf));
}
// json字符串数据转Uint8Array
function stringToUint8Array(str) {
  var arr = [];
  for (var i = 0, j = str.length; i < j; ++i) {
    arr.push(str.charCodeAt(i));
  }

  var tmpUint8Array = new Uint8Array(arr);
  return tmpUint8Array
}
// 拼接数据
function concatenate(resultConstructor, ...arrays) {
  let totalLength = 0;
  for (let arr of arrays) {
    totalLength += arr.length;
  }
  let result = new resultConstructor(totalLength);
  let offset = 0;
  for (let arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}
//计算校验和
function sum(arrays) {
  var sum = 0;
  for (let i = 0; i < arrays.length; i++) {
    sum = sum + arrays[i];
  }
  return sum;
}
//数据转为指定格式
function Transformation(code, data) { //code 命令码   data 写入数据
  let datalength;
  let dataStr;
  let dataArray; //连接 命令码 数据长度 数据
  if (!data) {
    datalength = 0;
    dataArray = concatenate(Int8Array, Int8Array.of(code), Int8Array.of(datalength))
  } else {
    dataStr = stringToUint8Array('{"data":' + JSON.stringify(data) + '}');
    datalength = dataStr.byteLength;
    dataArray = concatenate(Int8Array, Int8Array.of(code), Uint8Array.of(datalength), dataStr)
  }
  //连接 命令码 数据长度 数据 校验和
  let totalarray = concatenate(Int8Array, dataArray, Int8Array.of(sum(dataArray)))
  return totalarray;
}
//判断首位是否为命令码
function checkCode(buf) {
  // 0xb1  -79   充电任务下发成功
  // 0xb2  -78   充电记录获取成功
  // 0xb3  -77   系统校时返回状态
  // 0xb4  -76   设置充电器状态
  // 0xb5  -75   返回蓝牙模块版本号
  // 0xb7  -73   通讯认证密钥ID
  if (buf[0] == '-79' || buf[0] == '-78' || buf[0] == '-77' || buf[0] == '-76' || buf[0] == '-75' || buf[0] == '-73') {
    return true;
  } else {
    return false;
  }
}
Page({
  data: {
    devices: [],
    log: [],
    connected: true, //原本是false
    chs: [],
    deviceId: '',
    writeDeviceId: '',
    writeServiceId: '',
    writeCharacteristicId: '',
    packData: [], // 分包数据
    cmd: null, // 命令码
    statusCode: null, // 状态码
    datalength: null, // 数据长度
    checkSums: null, // 校验和
    req_key_id:'',
  },
 //拼接硬件返回的分包数据
  parseReturnData(buf) {
    var that = this;
    var buf = new Int8Array(buf);
    //校验是不是首条包
    var isFirstPackage = checkCode(buf);
    var singleBag = Array.from(buf);
    if (isFirstPackage) {
      that.data.cmd = singleBag[0];
      that.data.statusCode = singleBag[1];
      that.data.datalength = singleBag[2];
      if (that.data.datalength == 0) { //数据长度为0，说明没有数据
        that.data.checkSums = singleBag[singleBag.length - 1];
      }
      if (that.data.datalength > 0 && that.data.datalength <= 16) { //数据长度大于0，说明没有数据
        that.data.checkSums = singleBag[singleBag.length - 1];
        that.data.packData = singleBag.splice(3, singleBag.length - 4);
        that.data.datalength = 0;
      }
      if (that.data.datalength > 17) { //数据长度大于17，说明数据分包了
        that.data.packData = singleBag.splice(3, singleBag.length - 3);
        that.data.datalength -= 17; //数据长度减17
      }
    } else {
      if (that.data.datalength > 0) {
        if (that.data.datalength <= 19) {
          that.data.checkSums = singleBag[singleBag.length - 1];
          that.data.packData = that.data.packData.concat(singleBag.splice(0, singleBag.length - 1));
          that.data.datalength = 0;
        } else {
          that.data.packData = that.data.packData.concat(singleBag);
          that.data.datalength -= 20; //数据长度减17
        }
      }
    }
    if (that.data.datalength == 0) {
      var data=ab2str(that.data.packData);
      console.log('返回值解析后:' + data);
      //把收到的数据解析出来展示在页面，方便测试
      that.showLog(that.data.cmd, that.data.statusCode, that.data.packData, that.data.checkSums);
      that.setData({
        packData: [], // 分包数据
        cmd: null, // 命令码
        statusCode: null, // 状态码
        datalength: null, // 数据长度
        checkSums: null, // 校验和
      })
    }
  },
  //接收硬件数据日志
  showLog(cmd, statusCode, packData, checkSums) {
    let value = cmd +','+ statusCode +','+ packData.toString() +','+checkSums;
    let name = '命令码:' + cmd + '，状态码：' + statusCode + ab2str(packData);
    console.log('value:' + value);
    console.log('name:' + name);
    let logItem = {
      value: value,
      name: name
    }
    let logLists = this.data.log;
    logLists.unshift(logItem);
    if (logLists.length > 5) {
      logLists.pop();
    }
    this.setData({
      log: logLists,
    })
  },
  //搜索蓝牙
  openBluetoothAdapter() {
    var that = this;
    //初始化蓝牙模块
    wx.openBluetoothAdapter({
      success: (res) => {
        console.log('openBluetoothAdapter success', res)
        that.startBluetoothDevicesDiscovery()
      },
      fail: (res) => {
        console.log(res);
        if (res.errCode === 10001) {
          wx.onBluetoothAdapterStateChange(function (res) {
            console.log('onBluetoothAdapterStateChange', res)
            if (res.available) {
              that.startBluetoothDevicesDiscovery()
            }
          })
        }
      }
    })
  },
  //开始搜寻附近的蓝牙外围设备
  startBluetoothDevicesDiscovery() {
    var that = this;

    if (that._discoveryStarted) {
      return
    }
    that._discoveryStarted = true
    wx.startBluetoothDevicesDiscovery({
      allowDuplicatesKey: true,
      success: (res) => {
        console.log('startBluetoothDevicesDiscovery success', res)
        that.onBluetoothDeviceFound()
      },
    })
  },
  //停止搜寻附近的蓝牙外围设备
  stopBluetoothDevicesDiscovery() {
    wx.stopBluetoothDevicesDiscovery()
  },
  //监听寻找到新设备的事件
  onBluetoothDeviceFound() {
    var that = this;
    wx.onBluetoothDeviceFound((res) => {
      res.devices.forEach(device => {
        console.log(device);
        if (!device.name && !device.localName) {
          return
        }
        const foundDevices = that.data.devices
        const idx = inArray(foundDevices, 'deviceId', device.deviceId)
        const data = {}
        if (idx === -1) {
          data[`devices[${foundDevices.length}]`] = device
        } else {
          data[`devices[${idx}]`] = device
        }
        that.setData(data)
      })
    })
  },
  //连接低功耗蓝牙设备
  createBLEConnection(e) {
    var that = this;
    const ds = e.currentTarget.dataset
    const deviceId = ds.deviceId
    const name = ds.name
    wx.createBLEConnection({
      deviceId,
      success: (res) => {
        that.setData({
          connected: true,
          name,
          deviceId,
        })
        that.getBLEDeviceServices(deviceId)
      }
    })
    that.stopBluetoothDevicesDiscovery()
  },
  //断开与低功耗蓝牙设备的连接
  closeBLEConnection() {
    var that = this;
    wx.closeBLEConnection({
      deviceId: that.data.deviceId,
      success(res) {
        that.clearConnectData(); //清空连接数据
        console.log(res)
      }
    })
  },
  //获取蓝牙设备所有服务(service)。
  getBLEDeviceServices(deviceId) {
    var that = this;
    wx.getBLEDeviceServices({
      deviceId,
      success: (res) => {
        //获取设备服务中isPrimary为true的服务
        for (let i = 0; i < res.services.length; i++) {
          if (res.services[i].isPrimary) {
            //获取这个服务的特征值
            that.getBLEDeviceCharacteristics(deviceId, res.services[i].uuid)
            return
          }
        }
      },
      fail(res) {
        console.error('22', res)
      }
    })
  },
  //获取蓝牙设备某个服务中所有特征值(characteristic)。
  getBLEDeviceCharacteristics(deviceId, serviceId) {
    var that = this;
    wx.getBLEDeviceCharacteristics({
      deviceId,
      serviceId,
      success: (res) => {
        console.log('getBLEDeviceCharacteristics success', res.characteristics)
        for (let i = 0; i < res.characteristics.length; i++) {
          let item = res.characteristics[i]
          if (item.properties.read) {
            //读取低功耗蓝牙设备的特征值的二进制数据值
            wx.readBLECharacteristicValue({
              deviceId,
              serviceId,
              characteristicId: item.uuid,
            })

          }
          //写入低功耗蓝牙设备的特征值的二进制数据值
          if (item.properties.write) {
            that.setData({
              canWrite: true,
              writeDeviceId: deviceId,
              writeServiceId: serviceId,
              writeCharacteristicId: item.uuid
            })
          }
          if (item.properties.notify || item.properties.indicate) {
            //启用低功耗蓝牙设备特征值变化时的 notify 功能
            wx.notifyBLECharacteristicValueChange({
              deviceId,
              serviceId,
              characteristicId: item.uuid,
              state: true,
              success(res) {
                console.log('notifyBLECharacteristicValueChange success', res);
                // 操作之前先监听，保证第一时间获取数据
                wx.onBLECharacteristicValueChange((characteristic) => {
                  console.log('蓝牙返回数据:');
                  console.log(characteristic.value);
                  //处理蓝牙返回的数据
                  that.parseReturnData(characteristic.value);
                })
              }
            })
          }
        }

      },
      fail(res) {
        console.error('getBLEDeviceCharacteristics', res)
      }
    })

  },
  //关闭蓝牙模块
  closeBluetoothAdapter() {
    wx.closeBluetoothAdapter()
    this._discoveryStarted = false
  },
  test() {
    var that = this;
    let data = {
      "devid": "0801012006231122334455",
      "key": "sPh0Hno7Ao",
      "req_key_id": 11
    };
    let code = 0xb7;
    let codeStatus = 0x01;
    let _Buffer = Transformation(code, codeStatus, data);
    console.log(_Buffer);
    that.writeBLECharacteristicValue(_Buffer);
  },
  //分包写入蓝牙
  writeBLECharacteristicValue(buffer) {
    let pos = 0;
    let bytes = buffer.byteLength;
    var that = this;
    let ArrayBuffer = buffer.buffer;
    console.log("bytes", bytes)
    while (bytes > 0) {
      let tmpBuffer;
      if (bytes > 20) {
        tmpBuffer = ArrayBuffer.slice(pos, pos + 20);
        pos += 20;
        bytes -= 20;
        wx.writeBLECharacteristicValue({
          deviceId: that.data.writeDeviceId,
          serviceId: that.data.writeServiceId,
          characteristicId: that.data.writeCharacteristicId,
          value: tmpBuffer,
          success(res) {
            console.log('第一次发送', res)
          },
          fail: function (res) {
            if (res.errCode == '10006') {
              that.clearConnectData(); //当前连接已断开，清空连接数据
            }
            console.log('发送失败', res)
          }
        })
        // })
        sleep(0.02)
      } else {
        tmpBuffer = ArrayBuffer.slice(pos, pos + bytes);
        pos += bytes;
        bytes -= bytes;
        wx.writeBLECharacteristicValue({
          deviceId: that.data.writeDeviceId,
          serviceId: that.data.writeServiceId,
          characteristicId: that.data.writeCharacteristicId,
          value: tmpBuffer,
          success(res) {
            console.log('第二次发送', res)
          },
          fail: function (res) {
            if (res.errCode == '10006') {
              that.clearConnectData(); //清空连接数据
              console.log('当前连接已断开');
            }
            console.log('发送失败', res)
          }
        })
        sleep(0.02)
      }
    }
  },
  //连接断开，清数据
  clearConnectData() {
    var that = this;
    that.setData({
      connected: false,
      chs: [],
      canWrite: false,
    })
  }
})