import { sleep, group, check, fail } from 'k6'
import http from 'k6/http'
import jsonpath from 'https://jslib.k6.io/jsonpath/1.0.2/index.js'

export const options = {
  cloud: {
    distribution: { 'amazon:us:ashburn': { loadZone: 'amazon:us:ashburn', percent: 100 } },
    apm: [],
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<500'],
  },
  scenarios: {
    Scenario_1: {
      executor: 'ramping-vus',
      gracefulStop: '30s',
      stages: [
        { target: 5, duration: '30s' },
        { target: 5, duration: '1m' },
        { target: 0, duration: '30s' },
      ],
      gracefulRampDown: '30s',
      exec: 'scenario_1',
    },
  },
}

export function scenario_1() {
  let response

  const vars = {}

  group('page_2 - https://pizza.pizzagavinshelley3.click/login', function () {
    // Login
    response = http.put(
      'https://pizza-service.pizzagavinshelley3.click/api/auth',
      '{"email":"a@jwt.com","password":"admin"}',
      {
        headers: {
          accept: '*/*',
          'accept-encoding': 'gzip, deflate, br, zstd',
          'accept-language': 'en-US,en;q=0.9',
          'content-type': 'application/json',
          origin: 'https://pizza.pizzagavinshelley3.click',
          priority: 'u=1, i',
          'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Microsoft Edge";v="146"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
        },
      }
    )

    if (!check(response, { 'login status 200': r => r.status === 200 })) {
      console.log(response.body)
      fail('Login failed')
    }

    vars['token'] = jsonpath.query(response.json(), '$.token')[0]

    sleep(2)

    // Get Menu
    response = http.get('https://pizza-service.pizzagavinshelley3.click/api/order/menu', {
      headers: {
        accept: '*/*',
        'accept-encoding': 'gzip, deflate, br, zstd',
        'accept-language': 'en-US,en;q=0.9',
        authorization: `Bearer ${vars['token']}`,
        'content-type': 'application/json',
        origin: 'https://pizza.pizzagavinshelley3.click',
        priority: 'u=1, i',
        'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Microsoft Edge";v="146"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
      },
    })

    vars['title1'] = jsonpath.query(response.json(), '$[4].title')[0]

    sleep(1)

    // Create Order
    response = http.post(
      'https://pizza-service.pizzagavinshelley3.click/api/order',
      `{"items":[{"menuId":1,"description":"Veggie","price":0.0038},{"menuId":2,"description":"Pepperoni","price":0.0042},{"menuId":3,"description":"Margarita","price":0.0042},{"menuId":4,"description":"Crusty","price":0.0028},{"menuId":5,"description":"${vars['title1']}","price":0.0099}],"storeId":"1","franchiseId":1}`,
      {
        headers: {
          accept: '*/*',
          'accept-encoding': 'gzip, deflate, br, zstd',
          'accept-language': 'en-US,en;q=0.9',
          authorization: `Bearer ${vars['token']}`,
          'content-type': 'application/json',
          origin: 'https://pizza.pizzagavinshelley3.click',
          priority: 'u=1, i',
          'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Microsoft Edge";v="146"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-site',
        },
      }
    )

    if (!check(response, { 'order status 200': r => r.status === 200 })) {
      console.log(response.body)
      fail('Create order failed')
    }

    vars['pizzaJwt'] = response.json().jwt

    if (!vars['pizzaJwt']) {
      console.log(response.body)
      fail('Order response did not contain pizza JWT')
    }

    sleep(3)

    // Verify Pizza JWT
    response = http.post(
      'https://pizza-factory.cs329.click/api/order/verify',
      JSON.stringify({ jwt: vars['pizzaJwt'] }),
      {
        headers: {
          accept: '*/*',
          'accept-encoding': 'gzip, deflate, br, zstd',
          'accept-language': 'en-US,en;q=0.9',
          authorization: `Bearer ${vars['token']}`,
          'content-type': 'application/json',
          origin: 'https://pizza.pizzagavinshelley3.click',
          priority: 'u=1, i',
          'sec-ch-ua': '"Chromium";v="146", "Not-A.Brand";v="24", "Microsoft Edge";v="146"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'cross-site',
          'sec-fetch-storage-access': 'active',
        },
      }
    )

    if (!check(response, { 'verify status 200': r => r.status === 200 })) {
      console.log(response.body)
      fail('Verify pizza JWT failed')
    }
  })
}