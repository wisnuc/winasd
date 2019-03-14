## BLE Protocol

> packet definition

***client -> device(request)***

```javascript
{
 action: '' // 'scan'/'xxx'/'net'/ ...
 seq: 1000,
 token: '', // optional 
 body:{}
}
```

***device -> client(response)***

```javascript
{
 seq: 1000,
 data:{} // exist while request success
 error:{ // exist while request failed
    code: 'EXXX'
 }
}
```





> Local Authentication Service
>
> serviceId:`60000000-0182-406c-9221-0a6680bd0943`

* characteristics

  * ids: [`60000001-0182-406c-9221-0a6680bd0943`, `60000002-0182-406c-9221-0a6680bd0943` ]

  * flags: read+indicate,  write + read

  * actions: 

    * `req` : 请求开始设备认证(设备开始闪烁灯/当已处于认证态调用会返回错误)

      * request: 无需参数 (从60000002写入)

      * response: (从60000001返回(通知)) 

        ```json
        {
            seq: 1000,
            data: {
                colors: ['120', '203', '123', '102']
            },
            error: {
                code: 'EBUSY'
            }
        }
        ```

    * `auth`:

      * request:(从60000002写入)

        ```js
        {
            seq:1000,
            action: 'auth',
            body:{
                color: '121'
            }
        }
        ```

      * response: (从60000001返回(通知)) 

        ```js
        {
            seq: 1000,
            data: {
                token: 'xxxx'
            },
            error: {
                code: 'ESTATE'/'xxx'
            }
        }
        ```



> Network Setting
>
> serviceId:`70000000-0182-406c-9221-0a6680bd0943`

- characteristics

  - ids: [`70000001-0182-406c-9221-0a6680bd0943`, `70000002-0182-406c-9221-0a6680bd0943` ]

  - flags: read+indicate,  write + read

  - actions: 

    - `AddAndActive`: 请求创建网络配置并尝试连接该配置

      

​	

​	

> Cloud Setting