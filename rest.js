const util = require('util');
const _ = require('underscore');
const request = require('request');
const crypto = require('crypto');
const VError = require('verror');
const md5 = require('md5');

var OKEX = function (api_key, secret, server, timeout) {
    this.api_key = api_key;
    this.secret = secret;
    this.server = server || 'https://www.okex.com';
    this.timeout = timeout || 20000;
};

var headers = {
    "contentType": "application/x-www-form-urlencoded",
    "User-Agent": "OKEX JavaScript API Wrapper"
};

OKEX.prototype.privateRequest = function (method, params, callback) {
    var functionName = 'OKEX.privateRequest()',
        self = this;

    if (!this.api_key || !this.secret) {
        var error = new VError('%s must provide api_key and secret to make this API request.', functionName);
        return callback(error);
    }

    if (!_.isObject(params)) {
        var error = new VError('%s second parameter %s must be an object. If no params then pass an empty object {}', functionName, params);
        return callback(error);
    }

    if (!callback || typeof(callback) != 'function') {
        var error = new VError('%s third parameter needs to be a callback function', functionName);
        return callback(error);
    }

    params.api_key = this.api_key;
    console.log(params)
    params.sign = this.signMessage(params);

    var options = {
        url: this.server + '/api/v1/' + method + '.do',
        method: 'POST',
        headers: headers,
        form: params
    };

    var requestDesc = util.format('%s request to url %s with method %s and params %s',
        options.method, options.url, method, JSON.stringify(params));

    executeRequest(options, requestDesc, callback);
};

/**
 * This method returns a signature for a request as a md5-encoded uppercase string
 * @param  {Object}  params   The object to encode
 * @return {String}           The request signature
 */
OKEX.prototype.signMessage = function getMessageSignature(params) {
    var formattedParams = formatParameters(params);

    // append secret key value pair
    formattedParams += '&secret_key=' + this.secret;

    return md5(formattedParams).toUpperCase();
};

/**
 * This method returns the parameters as key=value pairs separated by & sorted by the key
 * @param  {Object}  params   The object to encode
 * @return {String}           formatted parameters
 */
function formatParameters(params) {
    var sortedKeys = [],
        formattedParams = '';

    // sort the properties of the parameters
    sortedKeys = _.keys(params).sort();

    // create a string of key value pairs separated by '&' with '=' assignement
    for (i = 0; i < sortedKeys.length; i++) {
        if (i != 0) {
            formattedParams += '&';
        }
        formattedParams += sortedKeys[i] + '=' + params[sortedKeys[i]];
    }

    return formattedParams;
}


OKEX.prototype.publicRequest = function (method, params, callback) {
    var functionName = 'OKEX.publicRequest()';

    if (!_.isObject(params)) {
        var error = new VError('%s second parameter %s must be an object. If no params then pass an empty object {}', functionName, params);
        return callback(error);
    }

    if (!callback || typeof(callback) != 'function') {
        var error = new VError('%s third parameter needs to be a callback function with err and data parameters', functionName);
        return callback(error);
    }

    var url = this.server + '/api/v1/' + method + '.do';

    var options = {
        url: url,
        method: 'GET',
        headers: headers,
        timeout: this.timeout,
        qs: params,
        json: {}        // request will parse the json response into an object
    };

    var requestDesc = util.format('%s request to url %s with parameters %s',
        options.method, options.url, JSON.stringify(params));

    executeRequest(options, requestDesc, callback)
};

function executeRequest(options, requestDesc, callback) {
    var functionName = 'OKEX.executeRequest()';

    request(options, function (err, response, data) {
        var error = null,   // default to no errors
            returnObject = data;

        if (err) {
            error = new VError(err, '%s failed %s', functionName, requestDesc);
            error.name = err.code;
        }
        else if (response.statusCode < 200 || response.statusCode >= 300) {
            error = new VError('%s HTTP status code %s returned from %s', functionName,
                response.statusCode, requestDesc);
            error.name = response.statusCode;
        }
        else if (options.form) {
            try {
                returnObject = JSON.parse(data);
            }
            catch (e) {
                error = new VError(e, 'Could not parse response from server: ' + data);
            }
        }
        // if json request was not able to parse json response into an object
        else if (options.json && !_.isObject(data)) {
            error = new VError('%s could not parse response from %s\nResponse: %s', functionName, requestDesc, data);
        }

        if (_.has(returnObject, 'error_code')) {
            var errorMessage = mapErrorMessage(returnObject.error_code);

            error = new VError('%s %s returned error code %s, message: "%s"', functionName,
                requestDesc, returnObject.error_code, errorMessage);
            error.info = errorMessage;

            error.name = returnObject.error_code;
        }

        callback(error, returnObject);
    });
}

//
// Public Functions
//

OKEX.prototype.getTicker = function getTicker(callback, symbol) {
    this.publicRequest('ticker', {symbol: symbol}, callback);
};

OKEX.prototype.getDepth = function getDepth(callback, symbol, size, merge) {
    var params = {
        symbol: symbol,
        size: 200,
        merge: 1
    };

    if (!_.isUndefined(size)) params.size = size;
    if (!_.isUndefined(merge)) params.merge = merge;

    this.publicRequest('depth', params, callback);
};

OKEX.prototype.getTrades = function getTrades(callback, symbol, since) {
    var params = {symbol: symbol};
    if (since) params.since = since;

    this.publicRequest('trades', params, callback);
};

OKEX.prototype.getKline = function getKline(callback, symbol, type, size, since) {
    var params = {symbol: symbol};
    if (type) params.type = type;
    if (size) params.size = size;
    if (since) params.since = since;

    this.publicRequest('kline', params, callback);
};

OKEX.prototype.getLendDepth = function getLendDepth(callback, symbol) {
    this.publicRequest('kline', {symbol: symbol}, callback);
};

//
// Private Functions
//

OKEX.prototype.getUserInfo = function getUserInfo(callback) {
    this.privateRequest('userinfo', {}, callback);
};

OKEX.prototype.addTrade = function addTrade(callback, symbol, type, amount, price) {
    var params = {
        //api_key: this.api_key,
        symbol: symbol,
        type: type
    };

    if (amount) params.amount = amount;
    if (price) params.price = price;

    this.privateRequest('trade', params, callback);
};

OKEX.prototype.addBatchTrades = function addBatchTrades(callback, symbol, type, orders) {
    this.privateRequest('batch_trade', {
        symbol: symbol,
        type: type,
        orders_data: orders
    }, callback);
};

OKEX.prototype.cancelOrder = function cancelOrder(callback, symbol, order_id) {
    this.privateRequest('cancel_order', {
        symbol: symbol,
        order_id: order_id
    }, callback);
};

OKEX.prototype.getOrderInfo = function getOrderInfo(callback, symbol, order_id) {
    this.privateRequest('order_info', {
        symbol: symbol,
        order_id: order_id
    }, callback);
};

OKEX.prototype.getOrdersInfo = function getOrdersInfo(callback, symbol, type, order_id) {
    this.privateRequest('orders_info', {
        symbol: symbol,
        type: type,
        order_id: order_id
    }, callback);
};

OKEX.prototype.getAccountRecords = function getAccountRecords(callback, symbol, type, current_page, page_length) {
    this.privateRequest('account_records', {
        symbol: symbol,
        type: type,
        current_page: current_page,
        page_length: page_length
    }, callback);
};

OKEX.prototype.getTradeHistory = function getTradeHistory(callback, symbol, since) {
    this.privateRequest('trade_history', {
        symbol: symbol,
        since: since
    }, callback);
};

OKEX.prototype.getOrderHistory = function getOrderHistory(callback, symbol, status, current_page, page_length) {
    this.privateRequest('order_history', {
        symbol: symbol,
        status: status,
        current_page: current_page,
        page_length: page_length
    }, callback);
};

OKEX.prototype.addWithdraw = function addWithdraw(callback, symbol, chargefee, trade_pwd, withdraw_address, withdraw_amount) {
    this.privateRequest('withdraw', {
        symbol: symbol,
        chargefee: chargefee,
        trade_pwd: trade_pwd,
        withdraw_address: withdraw_address,
        withdraw_amount: withdraw_amount
    }, callback);
};

OKEX.prototype.cancelWithdraw = function cancelWithdraw(callback, symbol, withdraw_id) {
    this.privateRequest('cancel_withdraw', {
        symbol: symbol,
        withdraw_id: withdraw_id
    }, callback);
};

/**
 * Maps the OKEX error codes to error message
 * @param  {Integer}  error_code   OKEX error code
 * @return {String}                error message
 */
function mapErrorMessage(error_code) {
    var errorCodes = {
        10000: 'Required parameter can not be null',
        10001: 'Requests are too frequent',
        10002: 'System Error',
        10003: 'Restricted list request, please try again later',
        10004: 'IP restriction',
        10005: 'Key does not exist',
        10006: 'User does not exist',
        10007: 'Signatures do not match',
        10008: 'Illegal parameter',
        10009: 'Order does not exist',
        10010: 'Insufficient balance',
        10011: 'Order is less than minimum trade amount',
        10012: 'Unsupported symbol (not btc_usd or ltc_usd)',
        10013: 'This interface only accepts https requests',
        10014: 'Order price must be between 0 and 1,000,000',
        10015: 'Order price differs from current market price too much',
        10016: 'Insufficient coins balance',
        10017: 'API authorization error',
        10026: 'Loan (including reserved loan) and margin cannot be withdrawn',
        10027: 'Cannot withdraw within 24 hrs of authentication information modification',
        10028: 'Withdrawal amount exceeds daily limit',
        10029: 'Account has unpaid loan, please cancel/pay off the loan before withdraw',
        10031: 'Deposits can only be withdrawn after 6 confirmations',
        10032: 'Please enabled phone/google authenticator',
        10033: 'Fee higher than maximum network transaction fee',
        10034: 'Fee lower than minimum network transaction fee',
        10035: 'Insufficient BTC/LTC',
        10036: 'Withdrawal amount too low',
        10037: 'Trade password not set',
        10040: 'Withdrawal cancellation fails',
        10041: 'Withdrawal address not approved',
        10042: 'Admin password error',
        10100: 'User account frozen',
        10216: 'Non-available API',
        20001: '用户不存在',
        20002: '用户被冻结',
        20003: '用户被爆仓冻结',
        20004: '合约账户被冻结',
        20005: '用户合约账户不存在',
        20006: '必填参数为空',
        20007: '参数错误',
        20008: '合约账户余额为空',
        20009: '虚拟合约状态错误',
        20010: '合约风险率信息不存在',
        20011: '10倍/20倍杠杆开BTC前保证金率低于90%/80%，10倍/20倍杠杆开LTC前保证金率低于80%/60%',
        20012: '10倍/20倍杠杆开BTC后保证金率低于90%/80%，10倍/20倍杠杆开LTC后保证金率低于80%/60%',
        20013: '暂无对手价',
        20014: '系统错误',
        20015: '订单信息不存在',
        20016: '平仓数量是否大于同方向可用持仓数量',
        20017: '非本人操作',
        20018: '下单价格高于前一分钟的103%或低于97%',
        20019: '该IP限制不能请求该资源',
        20020: '密钥不存在',
        20021: '指数信息不存在',
        20022: '接口调用错误（全仓模式调用全仓接口，逐仓模式调用逐仓接口）',
        20023: '逐仓用户',
        20024: 'sign签名不匹配',
        20025: '杠杆比率错误',
        20026: 'API鉴权错误',
        20027: '无交易记录',
        20028: '合约不存在',
        20029: '转出金额大于可转金额',
        20030: '账户存在借款',
        20038: '根据相关法律，您所在的国家或地区不能使用该功能。',
        20049: '用户请求接口过于频繁',
        20061: '合约相同方向只支持一个杠杆，若有10倍多单，就不能再下20倍多单',
        21020: '合约交割中，无法下单',
        21021: '合约清算中，无法下单',
        503: 'Too many requests (Http)'
    };

    if (!errorCodes[error_code]) {
        return 'Unknown OKEX error code: ' + error_code;
    }

    return ( errorCodes[error_code] );
}

/**
 * 合约交易
 *
 * contract_type this_week:当周 next_week:下周 quarter:季度
 */

function handleContractType(params, contract_type) {
    params.contract_type = 'quarter';
    if (contract_type) params.contract_type = contract_type;
    return params;
}

//
// Public Functions
//
//1.获取行情
OKEX.prototype.getFutureTicker = function getFutureTicker(callback, symbol, contract_type) {
    var params = {symbol: symbol, contract_type: 'quarter'};
    if (contract_type) params.contract_type = contract_type;
    this.publicRequest('future_ticker', params, callback);
};

//2.获取深度
OKEX.prototype.getFutureDepth = function getFutureDepth(callback, symbol, size, merge, contract_type) {
    var params = {
        symbol: symbol,
        size: 200,
        merge: 1
    };

    if (!_.isUndefined(size)) params.size = size;
    if (!_.isUndefined(merge)) params.merge = merge;

    this.publicRequest('future_depth', handleContractType(params, contract_type), callback);
};

//3.获取OKEx合约交易记录信息
OKEX.prototype.getFutureTrades = function getFutureTrades(callback, symbol, contract_type) {
    var params = {symbol: symbol};
    this.publicRequest('future_trades', handleContractType(params, contract_type), callback);
};

//4.获取OKEx合约指数信息
OKEX.prototype.getFutureIndex = function getFutureIndex(callback, symbol) {
    var params = {symbol: symbol};
    this.publicRequest('future_index', params, callback);
};

//5.获取美元人民币汇率
OKEX.prototype.getExchangeRate = function getExchangeRate(callback) {
    this.publicRequest('exchange_rate', {}, callback);
};

//6.Get /api/v1/future_estimated_price 获取交割预估价

/**
 * 7.获取OKEx合约K线信息
 * @param callback
 * @param symbol
 * @param type  1min/3min/5min/15min/30min/1day/3day/1week/1hour/2hour/4hour/6hour/12hour
 * @param contract_type
 */
OKEX.prototype.getFutureKline = function getFutureKline(callback, symbol, type, size, since, contract_type) {
    var params = {symbol: symbol};
    if (type) params.type = type;
    if (size) params.size = size;
    if (since) params.since = since;

    this.publicRequest('future_kline', handleContractType(params, contract_type), callback);
};

//8.获取当前可用合约总持仓量
OKEX.prototype.getFutureHoldAmount = function getFutureHoldAmount(callback, symbol, contract_type) {
    var params = {symbol: symbol};
    this.publicRequest('future_hold_amount', handleContractType(params, contract_type), callback);
};

//
//Private Functions
//
//1.获取OKEx合约账户信息(全仓)
OKEX.prototype.getFutureUserInfo = function getFutureUserInfo(callback) {
    this.privateRequest('future_userinfo', {}, callback);
};

//2.获取用户持仓获取OKEX合约账户信息 （全仓）
OKEX.prototype.getFuturePosition = function getFuturePosition(callback, symbol, contract_type) {
    var params = {
        symbol: symbol
    };
    this.privateRequest('future_position', handleContractType(params, contract_type), callback);
};

//3.合约下单
OKEX.prototype.addFutureTrade = function addFutureTrade(callback, symbol, type, amount, price, match_price, contract_type) {
    var params = {
        symbol: symbol,
        type: type
    };

    if (amount) params.amount = amount;
    if (price) params.price = price;
    if (match_price) params.match_price = match_price;

    this.privateRequest('trade', handleContractType(params, contract_type), callback);
};

//4.获取OKEX合约交易历史（非个人）访问频率

//5.POST /api/v1/future_batch_trade 批量下单

//6.取消合约订单
OKEX.prototype.cancelFutureOrder = function cancelFutureOrder(callback, symbol, order_id, contract_type) {
    var params = {
        symbol: symbol,
        order_id: order_id
    };
    this.privateRequest('cancel_order', handleContractType(params, contract_type), callback);
};

//7.获取合约订单信息
OKEX.prototype.getFutureOrderInfo = function getFutureOrderInfo(callback, symbol, order_id, status, contract_type) {
    var params = {
        symbol: symbol,
        order_id: order_id
    };
    if (order_id == '-1') params.status = status;
    this.privateRequest('future_order_info', handleContractType(params, contract_type), callback);
};

//8.POST /api/v1/future_orders_info 批量获取合约订单信息

//9.POST /api/v1/future_userinfo_4fix 获取逐仓合约账户信息
OKEX.prototype.getFutureUserInfoFix = function getFutureUserInfoFix(callback) {
    this.privateRequest('future_userinfo_4fix', {}, callback);
};

//10.POST /api/v1/future_position_4fix 逐仓用户持仓查询
OKEX.prototype.getFuturePositionFix = function getFuturePositionFix(callback, symbol, contract_type) {
    var params = {
        symbol: symbol
    };
    this.privateRequest('future_position_4fix', handleContractType(params, contract_type), callback);
};

//11.POST /api/v1/future_explosive 获取合约爆仓单

//12.POST /api/v1/future_devolve 个人账户资金划转

module.exports = OKEX;