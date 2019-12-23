import React, { Component } from 'react';
import ProgressBar from './progress-bar.png';
import './App.css';
import $ from 'jquery';

class App extends Component {
  constructor () {
    super();

    this.state = {
      fileUploaded: false,
      files: []
    }
  }

  sendFileToBox () {
    var selectedFile = document.getElementById('myFile').files[0];
    var form = new FormData();
    form.append('file', selectedFile)
    form.append('parent_id', '26488864303')

    $.ajax({
        url: 'https://upload.box.com/api/2.0/files/content',
        headers: {Authorization: 'Bearer WjP4OwiQ4MD1YEwXCZoODJyvHgZu4Kmr'},
        type: 'POST',
        processData: false,
        contentType: false,
        dataType: 'json',
        data: form
    }).then((response) => {
      const fileName = response.entries[0].name;
      const fileId = response.entries[0].id
      this.setState({
          fileUploaded: true,
          files: this.state.files.concat([[fileName, fileId]])
        })
    }
    )
  }

  render() {
    let files;
    if (this.state.files) {
      files = this.state.files.map((file, idx) => {
        return(
          <p onClick={() => this.previewDoc(file[1])} key={idx}>
            {file[0]}
          </p>
        )
      })
    }

    return (
      <div className="App">
        <div className="App-header">
          <img src={ProgressBar} alt="progress bar" />
        </div>

        <div className="App-body">
          <h2>Step 3: Upload your loan application</h2>

          <h3 className={this.state.fileUploaded ? "" : "hidden"}>
            Upload successful. Your documents are being stored securely with Bank of America.
          </h3>

          <div>{files}</div>

          <input
            onChange={() => this.sendFileToBox()}
            type="file"
            id="myFile"
            />
        </div>
      </div>
    );
  }
}

export default App;
# Colour constants
bold=`tput bold`
green=`tput setaf 2`
red=`tput setaf 1`
reset=`tput sgr0`

ALICE_PORT=10001
BOB_PORT=10002

ALICE_LOG=bin/testnet/test/alice.txt
BOB_LOG=bin/testnet/test/bob.txt

if test -d bin; then cd bin; fi

echo "${bold}Mounting a RAM disk for server output in test directory!${reset}"
if mountpoint -q -- "test"; then
    sudo umount test
fi

rm -r test | true # in case this is the first time being run
mkdir test && sudo mount -t tmpfs -o size=5000m tmpfs test

# Source Intel Libraries
source /opt/intel/sgxsdk/environment

pushd ../../ # go to source directory
echo "${bold}Starting two ghost teechain enclaves...${reset}"

echo "${bold}Spawning enclave ALICE listening on port $ALICE_PORT in $ALICE_LOG ${reset}"
./teechain ghost -d -p $ALICE_PORT > $ALICE_LOG 2>&1 &
sleep 1

echo "${bold}Spawning enclave BOB listening on port $BOB_PORT in $BOB_LOG ${reset}"
./teechain ghost -d -p $BOB_PORT > $BOB_LOG 2>&1 &
sleep 1

echo -n "${red}Waiting until enclaves are initialized ...!${reset}"
for u in alice bob; do  #TODO: generalize to multiple parties (not just 4)
    while [ "$(grep -a 'Enclave created' bin/testnet/test/${u}.txt | wc -l)" -eq 0 ]; do
        sleep 0.1
        echo -n "."
    done
done

# Create primaries
./teechain primary -p $ALICE_PORT
./teechain primary -p $BOB_PORT

# Setup up primaries with number of deposits
./teechain setup_deposits 5 -p $ALICE_PORT
./teechain setup_deposits 3 -p $BOB_PORT

# Deposits made
./teechain deposits_made mmY6ijr6uLP3DdRFC4nwL23HSKsH2xgy74 1 5 edec34c9bb3a4395cd8d1e9300725f537235d8a058fc6a7ae519003b64fd0feA 0 1 edec34c9bb3a4395cd8d1e9300725f537235d8a058fc6a7ae519003b64fd0feA 1 1 edec34c9bb3a4395cd8d1e9300725f537235d8a058fc6a7ae519003b64fd0feA 2 1 edec34c9bb3a4395cd8d1e9300725f537235d8a058fc6a7ae519003b64fd0feA 3 1 edec34c9bb3a4395cd8d1e9300725f537235d8a058fc6a7ae519003b64fd0feA 4 1 -p $ALICE_PORT
./teechain deposits_made my6NJU1T6gL5f3TfmSPN4idUytdCQHTmsU 1 3 edec34c9bb3a4395cd8d1e9300725f537235d8a058fc6a7ae519003b64fd0feB 0 1 edec34c9bb3a4395cd8d1e9300725f537235d8a058fc6a7ae519003b64fd0feB 1 1 edec34c9bb3a4395cd8d1e9300725f537235d8a058fc6a7ae519003b64fd0feB 2 1  -p $BOB_PORT

# Create and establish a channel between Alice and Bob
./teechain create_channel -p $BOB_PORT &
sleep 1
./teechain create_channel -i -r 127.0.0.1:$BOB_PORT -p $ALICE_PORT # Initiator

sleep 2

# Extract the channel id for the channel created
CHANNEL_1=$(grep "Channel ID:" $ALICE_LOG | awk '{print $3}')

# Verified the setup transactions are in the blockchain
./teechain verify_deposits $CHANNEL_1 -p $BOB_PORT &
./teechain verify_deposits $CHANNEL_1 -p $ALICE_PORT

sleep 2

# Alice and Bob add deposits to their channels now
./teechain add_deposit $CHANNEL_1 0 -p $ALICE_PORT
./teechain add_deposit $CHANNEL_1 0 -p $BOB_PORT

# Alice check balance matches expected
./teechain balance $CHANNEL_1 -p $ALICE_PORT
if ! tail -n 2 $ALICE_LOG | grep -q "My balance is: 1, remote balance is: 1"; then
    echo "Alice's balance check failed on channel setup!"; exit 1;
fi

# Send from Bob to Alice
./teechain send $CHANNEL_1 1 -p $BOB_PORT

# Alice check balance after
./teechain balance $CHANNEL_1 -p $ALICE_PORT
if ! tail -n 2 $ALICE_LOG | grep -q "My balance is: 2, remote balance is: 0"; then
    echo "Alice's balance check failed after send!"; exit 1;
fi

# Send from Bob to Alice should fail. Bob check balance, shouldn't have changed
./teechain send $CHANNEL_1 1 -p $BOB_PORT
./teechain balance $CHANNEL_1 -p $BOB_PORT
if ! tail -n 2 $BOB_LOG | grep -q "My balance is: 0, remote balance is: 2"; then
    echo "Bob's balance check failed!"; exit 1;
fi
# Add deposit from bob's side and check balance
./teechain add_deposit $CHANNEL_1 1 -p $BOB_PORT
./teechain balance $CHANNEL_1 -p $BOB_PORT
if ! tail -n 2 $BOB_LOG | grep -q "My balance is: 1, remote balance is: 2"; then
    echo "Bob's balance check failed!"; exit 1;
fi
echo "Bob added another deposit to his channel!"
# Send from Bob to Alice and check balance is back to zero
./teechain send $CHANNEL_1 1 -p $BOB_PORT
./teechain balance $CHANNEL_1 -p $BOB_PORT
if ! tail -n 2 $BOB_LOG | grep -q "My balance is: 0, remote balance is: 3"; then
    echo "Bob's balance check failed!"; exit 1;
fi
# Send from Alice to Bob and check Bob's balance on Alice's side
./teechain send $CHANNEL_1 1 -p $ALICE_PORT
./teechain balance $CHANNEL_1 -p $ALICE_PORT
if ! tail -n 2 $ALICE_LOG | grep -q "My balance is: 2, remote balance is: 1"; then
    echo "Alice's balance check failed!"; exit 1;
fi
# Bob remove deposit and check balance
./teechain remove_deposit $CHANNEL_1 1 -p $BOB_PORT
./teechain balance $CHANNEL_1 -p $BOB_PORT
if ! tail -n 2 $BOB_LOG | grep -q "My balance is: 0, remote balance is: 2"; then
    echo "Bob's balance check failed!"; exit 1;
fi
echo "Bob removed the deposit from his channel!"
# Bob try to remove first deposit, should fail as insufficient funds
./teechain remove_deposit $CHANNEL_1 0 -p $BOB_PORT
./teechain balance $CHANNEL_1 -p $BOB_PORT
if ! tail -n 2 $BOB_LOG | grep -q "My balance is: 0, remote balance is: 2"; then
    echo "Bob's balance check failed!"; exit 1;
fi
echo "Bob removed his last deposit from the channel!"
# Bob now send 1 to alice
./teechain send $CHANNEL_1 1 -p $BOB_PORT
./teechain balance $CHANNEL_1 -p $BOB_PORT
if ! tail -n 2 $BOB_LOG | grep -q "My balance is: 0, remote balance is: 1"; then
    echo "Bob's balance check failed!"; exit 1;
fi
echo "Bob sent 1 to Alice!"
# Alice removed last deposit from channel
./teechain remove_deposit $CHANNEL_1 0 -p $ALICE_PORT
./teechain balance $CHANNEL_1 -p $ALICE_PORT
if ! tail -n 2 $ALICE_LOG | grep -q "My balance is: 0, remote balance is: 0"; then
    echo "Alice's balance check failed!"; exit 1;
fi
echo "Alice removed her last deposit from the channel!"
# Bob now send 1 to alice
./teechain send $CHANNEL_1 1 -p $BOB_PORT
./teechain balance $CHANNEL_1 -p $BOB_PORT
if ! tail -n 2 $BOB_LOG | grep -q "My balance is: 0, remote balance is: 0"; then
    echo "Bob's balance check failed!"; exit 1;
fi
echo "Bob tried to send 1 to alice, but it didnt work!"
# Add all the deposits to the channel (both sides)
./teechain add_deposit $CHANNEL_1 0 -p $ALICE_PORT
./teechain add_deposit $CHANNEL_1 1 -p $ALICE_PORT
./teechain add_deposit $CHANNEL_1 2 -p $ALICE_PORT
./teechain add_deposit $CHANNEL_1 3 -p $ALICE_PORT
./teechain add_deposit $CHANNEL_1 4 -p $ALICE_PORT
./teechain add_deposit $CHANNEL_1 0 -p $BOB_PORT
./teechain add_deposit $CHANNEL_1 1 -p $BOB_PORT
./teechain add_deposit $CHANNEL_1 2 -p $BOB_PORT
./teechain balance $CHANNEL_1 -p $ALICE_PORT
./teechain balance $CHANNEL_1 -p $BOB_PORT
if ! tail -n 2 $ALICE_LOG | grep -q "My balance is: 5, remote balance is: 3"; then
    echo "Alice's balance check failed!"; exit 1;
fi
if ! tail -n 2 $BOB_LOG | grep -q "My balance is: 3, remote balance is: 5"; then
    echo "Bob's balance check failed!"; exit 1;
fi
echo "All deposits added to the channel!"
# Bob now send 3 to alice
./teechain send $CHANNEL_1 3 -p $BOB_PORT
./teechain balance $CHANNEL_1 -p $BOB_PORT
if ! tail -n 2 $BOB_LOG | grep -q "My balance is: 0, remote balance is: 8"; then
    echo "Bob's balance check failed!"; exit 1;
fi
echo "Bob sent all 3 to Alice!"
# Settle and shutdown
./teechain settle_channel $CHANNEL_1 -p $ALICE_PORT
# Alice decides to get her unused deposits out (there are no used deposits!)
./teechain shutdown -p $ALICE_PORT
popd # return to bin directory
../kill.sh
echo "${bold}Looks like the test passed!${reset}"
  -----BEGIN CERTIFICATE-----
MIIDhTCCAm2gAwIBAgIJALjCgEBIwDscMA0GCSqGSIb3DQEBBQUAMFkxCzAJBgNV
BAYTAkFVMRMwEQYDVQQIDApTb21lLVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBX
aWRnaXRzIFB0eSBMdGQxEjAQBgNVBAMMCWxvY2FsaG9zdDAeFw0xMzAzMDgxMzQw
MDJaFw0yMzAzMDYxMzQwMDJaMFkxCzAJBgNVBAYTAkFVMRMwEQYDVQQIDApTb21l
LVN0YXRlMSEwHwYDVQQKDBhJbnRlcm5ldCBXaWRnaXRzIFB0eSBMdGQxEjAQBgNV
BAMMCWxvY2FsaG9zdDCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAOTL
p47Qy1hovBC6VWi33CCpq5r5+QHnt5PLsjhOoZ0VjHI0KYNMPkT9yfwJZO8vHEsW
dDoW+fRojp+VO6JOYcO1JAr0jBlnzfOlr+zBHKvaEWylku9DS5ZbxLnj4AQe5m5/
uqtlQt4ib4vXQr3yfW8B9Jy55OfWV8m9orfxubOzK1Ll0LeDwubKgUwuzB3auJKb
VNsIlZQzrKDzMoTExtKF/7cSUC+5+1UHFy9rUh9VOtU2RkFJQgOPOyw9lmg7pCfl
uurz4Q8wjSchhWvMnEc8YenqOaA+AcmlFiHwQq3z0aILCa5IEUOUzwER4bZM6eDe
8rZLG+uRAABhhfC/LfUCAwEAAaNQME4wHQYDVR0OBBYEFEhAKuSwT9BxLaHcxzmn
CDZ7bxycMB8GA1UdIwQYMBaAFEhAKuSwT9BxLaHcxzmnCDZ7bxycMAwGA1UdEwQF
MAMBAf8wDQYJKoZIhvcNAQEFBQADggEBAIK1pI70uzMET8QAJ6o0rBsuYnat9WeL
Y/27yKWg440BoWYxI6XJPP+nnncesGxcElnQCPkut8ODIGG037WKuQNRMr7dBQeU
MIaIxKGZETGIj5biao6tqYuWwIS54NxOTIUVx4QomXnyLNyE0Mj4ftD8bKEIuVfV
2bDC6UjN02lPh2IsV+th5oOr3BShwafu+7CAKLSaidraUW/hGKSWpMgBSBHnA2tD
W3mLidFxB2ufi6ufT87HliC6AJw6S9A5+iuAIEuRGV4zhc4BZpKTeeFRVWYPUBtp
/SoNIeLQ4ORhIFQjTY2nEq2lGnCJ0JcTTt1gVNbsEitRtw0eAUtMTXs=
-----END CERTIFICATE-----
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAuZ4RZVnjh8kS32TZn7pMWJevf473pLqecObWMLmeB6FIzpvf
kYi8RyLD9Q87QjmIhbrqFncyaBaw1iz5sx2sVM2+acwlocN4UHPBCxwvmtUeEn1t
WMp29D4NetJNssvq7PxzcXY7bv7FQ7q7kJ5KpoBc+OBu/4vdQhM0gkR5QEL52KNj
C8umfhc2aEeRn4et9lBqNlE4WjH3s5tOO3DqNt5kQ28hulcSaiPMaKPcjqmAYz8+
VLOY7fefGNBecr72MaA5St+oc0TDK6msHPoTtYe4b6r6AsyM9O+7f82idtWK9nu/
rjQZP2UeMQvqUtQj+Ar3WoM60SkEQ8Ckq6PQPwIDAQABAoIBAFUlZFd4r34HR8gA
LDAwNnthQZkjDQicrredvF1nmE1pt8tHB3xsG+oJ0Zgln4pWeADYaC9cCFxlJENr
KDP5Bad1JcbEZfLZhuRo5QHisRe2cXAL51AWuBB8MpTHyeqdzitd9tryYHsfFYBn
NUk2w4mzUnK8CU7iauG3i5vCK1jFV9OvedeQGjmKcJ39U4R8qOQesTP1x0tc7C8Y
SgSNaicZKXcHOlHntk6sGfpCekDX0bPKAOB2CMtbujeUNB/wgM/eEGLugdddXHfV
GErnqqnSCUog3bhZLaEOdl4XOJZtBmKIzQcUecNH3myADgpSm+AethCYErRqmvIj
FhXNfVkCgYEA7B2NjuOeaxoIgqPVN+DFVOVOv25AODLpgZDrfPZqr0E231LaexRn
xtsuJpxQ/lGPgY6dOrhX6d5HEQ2JrFDiKyv+uP7V/s9Wp562UhSMRLzuXWg7phto
yuia2bwj9k4Fwl9b3tQfJMxUulv2Bkq4+ZtuX0bFw8P4C3xwQMLQCgMCgYEAyT/S
UFIFp2u/7tXce5qrT3Z/SMe3qa+1DeosmhdCNQdJhV0p7rARX0bl+UN1oeDg65Sb
khzmTf+zpB0Nho63+W/CjlSdHBBFPTgSgjejkfiENfW63HBT18K0ya2LC4+fOuWg
e35VBJjKZT4nUTjZ/rscdeKNve4SvSWl3dFPqhUCgYEAgqIbJroydKkTmkvQdLjs
FHtF5U23RCCO5ntqflnLTqkzFb2+WShB/lhXoU8M1JgFYLWpsco6AY9UHFA0Il0h
tKcDqBB+Dxthox2BW8o4jPNGofFARzeU8+ZbfinEb8pdD1w49QDBNlfCbNTiOjrv
OlJPb3E1i4kJ3Dj91iayeUcCgYEAgS5qfgxofLN5nIHC6cS6umNCCSHKDy4udiQf
RTow0YE//E91HzX9sL792CcpVyPWvOHDiuLqIp9EXNAZYooyJfdLV7mQr/bxuv5H
Qzcb1BNGKqz1qZKg/xqImfzACEfE2jWT8jGBuVWqdZqT+lsX85+AAVvPyF8NwERu
WBiHnpECgYA28LMcfOVplez7z7wxzoVZyq7I7yV50RCxZiJ6GepZPzTnqR2LAmb6
2qMOJkShHk/pydtF+49j9/MjWJexGWaCbsFaei/bnsZfskEF+/2MFmBp6fAN1FRP
FLNEF+YTPz6yFCNWecZ2INEAokEi2D809XhDQwiJz0E2vEzhR93fDg==
-----END RSA PRIVATE KEY-----
  {
  using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using WebmailServer.Models;
using WebmailServer.ViewModels;
using AutoMapper;
using Microsoft.EntityFrameworkCore;

namespace webmail_server.Controllers
{
    [Produces("application/json")]
    [Route("api/Mailbox")]
    public class MailboxController : Controller
    {
        private readonly webmailContext _context;

        public MailboxController(webmailContext context)
        {
            _context = context;
        }

        [HttpGet("user/{userId}/folders", Name = "folders")]
        public IEnumerable<MailboxFolder> Folders(int userId)
        {
            List<MailboxFolder> mailboxFolders = new List<MailboxFolder>();

            var userEmails = _context.UserEmail
                .Where(e => e.UserId == userId)
                .GroupBy(e => e.CategoryId)
                .ToList();

            foreach (var group in userEmails)
            {
                MailboxFolder folder = new MailboxFolder()
                {
                    Category = group.Key,
                    TotalEmails = group.Count(),
                    UnreadEmails = group.Where(e => e.IsRead == false).Count()
                };

                mailboxFolders.Add(folder);
            }


            return mailboxFolders;
        }

        [HttpGet("user/{userId}/folder/{category}/emails", Name = "folderEmails")]
        public FolderEmailsVM FolderEmails(int userId, int category)
        {
            List<int> userIds = new List<int>();
            
            List<UserEmail> userEmails = _context.UserEmail.Include(ue => ue.Email)
                .Where(e => e.UserId == userId && e.CategoryId == category).ToList();

            List<Email> emails = _context.Email
                .Include(e => e.UserEmail)
                .Where(e => (userEmails.Select(ue => ue.EmailId).Contains(e.Id)))
                .ToList();

            foreach (Email e in emails)
            {
                userIds.AddRange(e.UserEmail.Select(ue => ue.UserId).Distinct());
            }
            userIds = userIds.Distinct().ToList();
            List<User> users = _context.User.Where(u => userIds.Contains(u.Id)).ToList();

            return new FolderEmailsVM()
            {
                emails = Mapper.Map<List<EmailVM>>(emails),
                userEmails = Mapper.Map<List<UserEmailVM>>(userEmails),
                users = Mapper.Map<List<UserVM>>(users)
            };
        }

        [HttpGet("email/{id}/history", Name = "emailHistory")]
        public EmailHistoryVM EmailHistory(int id)
        {
            List<int> userIds = new List<int>();
            List<Email> emails = new List<Email>();
            List<User> users = new List<WebmailServer.Models.User>();

            Email email = _context.Email
                .Include(e => e.Parent)
                .ThenInclude(e => e.UserEmail).Where(e => e.Id == id).First();

            if(email.Parent != null)
            {
                emails.Add(email.Parent);
                userIds.AddRange(email.Parent.UserEmail.Select(ue => ue.UserId).Distinct());
            }

            userIds = userIds.Distinct().ToList();

            users = _context.User.Where(u => userIds.Contains(u.Id)).ToList();

            return new EmailHistoryVM()
            {
                emails = Mapper.Map<List<EmailVM>>(emails),
                users = Mapper.Map<List<UserVM>>(users)
            };
        }

        [HttpPost("send")]
        public void PostEmail([FromBody] EmailVM emailVm)
        {
            Email email = new Email()
            {
                AuthorId = emailVm.AuthorId,
                Subject = emailVm.Subject,
                Body = emailVm.Body,
                DateCreated = DateTime.Now,
                ParentId = emailVm.ParentId
            };

            foreach(var receiver in emailVm.Receivers)
            {
                email.UserEmail.Add(new UserEmail()
                {
                    CategoryId = 1,
                    UserId = receiver
                });
            }

            email.UserEmail.Add(new UserEmail()
            {
                CategoryId = 4,
                UserId = emailVm.AuthorId
            });

            _context.Email.Add(email);
             _context.SaveChanges();
        }
    }
}
-----BEGIN CERTIFICATE-----

MIIB8TCCAVoCCQCg2ZYlANUEvjANBgkqhkiG9w0BAQsFADA9MQswCQYDVQQGEwJV

UzELMAkGA1UECAwCQ0ExITAfBgNVBAoMGEludGVybmV0IFdpZGdpdHMgUHR5IEx0

ZDAeFw0xNDA4MTgyMzE5NDJaFw0xNTA4MTgyMzE5NDJaMD0xCzAJBgNVBAYTAlVT

MQswCQYDVQQIDAJDQTEhMB8GA1UECgwYSW50ZXJuZXQgV2lkZ2l0cyBQdHkgTHRk

MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDV4suKtPRyipQJg35O/wIndwm+

5RV+s+jqo8VS7tJ1E4OIsSMo7eVuNU4pLTIqehNN+Skyk/i17y6cPwo2Mff+E6VB

lJrjNLO+rI+B7Ttx7Cs9imoE38Pmv0LKzQbAz8Uz3T6zxXHJpjIWA4PKiw+mO6qw

niEDDutypPa2mB+KjQIDAQABMA0GCSqGSIb3DQEBCwUAA4GBAHUfkcY4wNZZGT3f

oCoB0cNy+gtS86Iu2XU+WzKWxQxvgSiloQ2l0NDsRlw9wBQQZNQOJtPNfTIXkpfU

NoD7qU0Dd0TawoIRAetWzweW0PIJt+Dh7/z7FUTXg5p2IRhOPVNA9+K1wBGfOkEF

6cYkdpr0FmQ52L+Vc1QcNCxwYtWm

-----END CERTIFICATE-----

resource "google_compute_network" "mesos-global-net" {

    name                    = "${var.name}-global-net"

    auto_create_subnetworks = false # custom subnetted network will be created that can support google_compute_subnetwork resources

}



resource "google_compute_subnetwork" "mesos-net" {

    name          = "${var.name}-${var.region}-net"

    ip_cidr_range = "${var.subnetwork}"

    network       = "${google_compute_network.mesos-global-net.self_link}" # parent network

}
var Buffer = require('safe-buffer').Buffer



module.exports = function base (ALPHABET) {

  var ALPHABET_MAP = {}

  var BASE = ALPHABET.length

  var LEADER = ALPHABET.charAt(0)



  // pre-compute lookup table

  for (var z = 0; z < ALPHABET.length; z++) {

    var x = ALPHABET.charAt(z)



    if (ALPHABET_MAP[x] !== undefined) throw new TypeError(x + ' is ambiguous')

    ALPHABET_MAP[x] = z

  }



  function encode (source) {

    if (source.length === 0) return ''



    var digits = [0]

    for (var i = 0; i < source.length; ++i) {

      for (var j = 0, carry = source[i]; j < digits.length; ++j) {

        carry += digits[j] << 8

        digits[j] = carry % BASE

        carry = (carry / BASE) | 0

      }



      while (carry > 0) {

        digits.push(carry % BASE)

        carry = (carry / BASE) | 0

      }

    }



    var string = ''



    // deal with leading zeros

    for (var k = 0; source[k] === 0 && k < source.length - 1; ++k) string += ALPHABET[0]

    // convert digits to a string

    for (var q = digits.length - 1; q >= 0; --q) string += ALPHABET[digits[q]]



    return string

  }



  function decodeUnsafe (string) {

    if (string.length === 0) return Buffer.allocUnsafe(0)



    var bytes = [0]

    for (var i = 0; i < string.length; i++) {

      var value = ALPHABET_MAP[string[i]]

      if (value === undefined) return



      for (var j = 0, carry = value; j < bytes.length; ++j) {

        carry += bytes[j] * BASE

        bytes[j] = carry & 0xff

        carry >>= 8

      }



      while (carry > 0) {

        bytes.push(carry & 0xff)

        carry >>= 8

      }

    }



    // deal with leading zeros

    for (var k = 0; string[k] === LEADER && k < string.length - 1; ++k) {

      bytes.push(0)

    }



    return Buffer.from(bytes.reverse())

  }



  function decode (string) {

    var buffer = decodeUnsafe(string)

    if (buffer) return buffer



    throw new Error('Non-base' + BASE + ' character')

  }



  return {

    encode: encode,

    decodeUnsafe: decodeUnsafe,

    decode: decode

  }

}



},{"safe-buffer":65}],4:[function(require,module,exports){

'use strict'



exports.byteLength = byteLength

exports.toByteArray = toByteArray

exports.fromByteArray = fromByteArray



var lookup = []

var revLookup = []

var Arr = typeof Uint8Array !== 'undefined' ? Uint8Array : Array



var code = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

for (var i = 0, len = code.length; i < len; ++i) {

  lookup[i] = code[i]

  revLookup[code.charCodeAt(i)] = i

}



revLookup['-'.charCodeAt(0)] = 62

revLookup['_'.charCodeAt(0)] = 63



function placeHoldersCount (b64) {

  var len = b64.length

  if (len % 4 > 0) {

    throw new Error('Invalid string. Length must be a multiple of 4')

  }



  // the number of equal signs (place holders)

  // if there are two placeholders, than the two characters before it

  // represent one byte

  // if there is only one, then the three characters before it represent 2 bytes

  // this is just a cheap hack to not do indexOf twice

  return b64[len - 2] === '=' ? 2 : b64[len - 1] === '=' ? 1 : 0

}



function byteLength (b64) {

  // base64 is 4/3 + up to two characters of the original data

  return b64.length * 3 / 4 - placeHoldersCount(b64)

}



function toByteArray (b64) {

  var i, j, l, tmp, placeHolders, arr

  var len = b64.length

  placeHolders = placeHoldersCount(b64)



  arr = new Arr(len * 3 / 4 - placeHolders)



  // if there are placeholders, only get up to the last complete 4 chars

  l = placeHolders > 0 ? len - 4 : len



  var L = 0



  for (i = 0, j = 0; i < l; i += 4, j += 3) {

    tmp = (revLookup[b64.charCodeAt(i)] << 18) | (revLookup[b64.charCodeAt(i + 1)] << 12) | (revLookup[b64.charCodeAt(i + 2)] << 6) | revLookup[b64.charCodeAt(i + 3)]

    arr[L++] = (tmp >> 16) & 0xFF

    arr[L++] = (tmp >> 8) & 0xFF

    arr[L++] = tmp & 0xFF

  }



  if (placeHolders === 2) {

    tmp = (revLookup[b64.charCodeAt(i)] << 2) | (revLookup[b64.charCodeAt(i + 1)] >> 4)

    arr[L++] = tmp & 0xFF

  } else if (placeHolders === 1) {

    tmp = (revLookup[b64.charCodeAt(i)] << 10) | (revLookup[b64.charCodeAt(i + 1)] << 4) | (revLookup[b64.charCodeAt(i + 2)] >> 2)

    arr[L++] = (tmp >> 8) & 0xFF

    arr[L++] = tmp & 0xFF

  }



  return arr

}



function tripletToBase64 (num) {

  return lookup[num >> 18 & 0x3F] + lookup[num >> 12 & 0x3F] + lookup[num >> 6 & 0x3F] + lookup[num & 0x3F]

}



function encodeChunk (uint8, start, end) {

  var tmp

  var output = []

  for (var i = start; i < end; i += 3) {

    tmp = (uint8[i] << 16) + (uint8[i + 1] << 8) + (uint8[i + 2])

    output.push(tripletToBase64(tmp))

  }

  return output.join('')

}



function fromByteArray (uint8) {

  var tmp

  var len = uint8.length

  var extraBytes = len % 3 // if we have 1 byte left, pad 2 bytes

  var output = ''

  var parts = []

  var maxChunkLength = 16383 // must be multiple of 3



  // go through the array every three bytes, we'll deal with trailing stuff later

  for (var i = 0, len2 = len - extraBytes; i < len2; i += maxChunkLength) {

    parts.push(encodeChunk(uint8, i, (i + maxChunkLength) > len2 ? len2 : (i + maxChunkLength)))

  }



  // pad the end with zeros, but make sure to not forget the extra bytes

  if (extraBytes === 1) {

    tmp = uint8[len - 1]

    output += lookup[tmp >> 2]

    output += lookup[(tmp << 4) & 0x3F]

    output += '=='

  } else if (extraBytes === 2) {

    tmp = (uint8[len - 2] << 8) + (uint8[len - 1])

    output += lookup[tmp >> 10]

    output += lookup[(tmp >> 4) & 0x3F]

    output += lookup[(tmp << 2) & 0x3F]

    output += '='

  }



  parts.push(output)



  return parts.join('')

}



},{}],5:[function(require,module,exports){

// (public) Constructor

function BigInteger(a, b, c) {

  if (!(this instanceof BigInteger))

    return new BigInteger(a, b, c)



  if (a != null) {

    if ("number" == typeof a) this.fromNumber(a, b, c)

    else if (b == null && "string" != typeof a) this.fromString(a, 256)

    else this.fromString(a, b)

  }

}



var proto = BigInteger.prototype



// duck-typed isBigInteger

proto.__bigi = require('../package.json').version

BigInteger.isBigInteger = function (obj, check_ver) {

  return obj && obj.__bigi && (!check_ver || obj.__bigi === proto.__bigi)

}



// Bits per digit

var dbits



// am: Compute w_j += (x*this_i), propagate carries,

// c is initial carry, returns final carry.

// c < 3*dvalue, x < 2*dvalue, this_i < dvalue

// We need to select the fastest one that works in this environment.



// am1: use a single mult and divide to get the high bits,

// max digit bits should be 26 because

// max internal value = 2*dvalue^2-2*dvalue (< 2^53)

function am1(i, x, w, j, c, n) {

  while (--n >= 0) {

    var v = x * this[i++] + w[j] + c

    c = Math.floor(v / 0x4000000)

    w[j++] = v & 0x3ffffff

  }

  return c

}
}
#' Get the logged in user's email and other info
#' 
#' @param id ID of the person to get the profile data for. 'me' to get current user.
#' 
#' @return A People resource
#' 
#' https://developers.google.com/+/web/api/rest/latest/people#resource-representations
#' 
#' @seealso https://developers.google.com/+/web/api/rest/latest/people
#' 
#' @export
#' 
#' @examples 
#' 
#' \dontrun{
#' library(googleAuthR)
#' library(googleID)
#' options(googleAuthR.scopes.selected = 
#'    c("https://www.googleapis.com/auth/userinfo.email",
#'      "https://www.googleapis.com/auth/userinfo.profile"))
#'                                         
#' googleAuthR::gar_auth()
#' 
#' ## default is user logged in
#' user <- get_user_info()
#' }
#' 
get_user_info <- function(id = "me"){
  
  url <- sprintf("https://www.googleapis.com/plus/v1/people/%s", id)
  
  g <- googleAuthR::gar_api_generator(url, "GET")
  
  req <- g()
  
  req$content
  
}
#' Whitelist check
#' 
#' After a user logs in, check to see if they are on a whitelist
#' 
#' @param user_info the object returned by \link{get_user_info}
#' @param whitelist A character vector of emails on whitelist
#' 
#' @return TRUE if on whitelist or no whitelist, FALSE if not
#' @export
#' 
#' @examples 
#' 
#' \dontrun{
#' library(googleAuthR)
#' library(googleID)
#' options(googleAuthR.scopes.selected = 
#'    c("https://www.googleapis.com/auth/userinfo.email",
#'      "https://www.googleapis.com/auth/userinfo.profile"))
#'                                         
#' googleAuthR::gar_auth()
#' 
#' ## default is user logged in
#' user <- get_user_info()
#' 
#' the_list <- whitelist(user, c("your@email.com", 
#'                               "another@email.com", 
#'                               "yet@anotheremail.com"))
#' 
#' if(the_list){
#'   message("You are on the list.")
#' } else {
#'   message("If you're not on the list, you're not getting in.")
#'}
#' 
#' 
#' 
#' }
whitelist <- function(user_info, whitelist = NULL){
  
  if(user_info$kind != "plus#person"){
    stop("Invalid user object used for user_info")
  }
  
  out <- FALSE
  
  if(is.null(whitelist)){
    message("No whitelist found")
    out <- TRUE
  }
  
  check <- user_info$emails$value
  
  if(is.null(check)){
    stop("No user email found")
  }
  
  if(any(check %in% whitelist)){
    message(check, " is in whitelist ")
    out <- TRUE
  } else {
    message(check, " is NOT on whitelist")
  }
  
  out
  
}


