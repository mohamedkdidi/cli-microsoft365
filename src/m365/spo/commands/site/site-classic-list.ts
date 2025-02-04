import { Logger } from '../../../../cli';
import { CommandOption } from '../../../../Command';
import config from '../../../../config';
import GlobalOptions from '../../../../GlobalOptions';
import request from '../../../../request';
import Utils from '../../../../Utils';
import SpoCommand from '../../../base/SpoCommand';
import commands from '../../commands';
import { ClientSvcResponse, ClientSvcResponseContents, FormDigestInfo } from '../../spo';
import { SiteProperties } from './SiteProperties';
import { SPOSitePropertiesEnumerable } from './SPOSitePropertiesEnumerable';

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  webTemplate?: string;
  filter?: string;
  includeOneDriveSites?: boolean;
}

class SpoSiteClassicListCommand extends SpoCommand {
  private allSites?: SiteProperties[];

  public get name(): string {
    return commands.SITE_CLASSIC_LIST;
  }

  public get description(): string {
    return 'Lists sites of the given type';
  }

  public getTelemetryProperties(args: CommandArgs): any {
    const telemetryProps: any = super.getTelemetryProperties(args);
    telemetryProps.webTemplate = args.options.webTemplate;
    telemetryProps.filter = (!(!args.options.filter)).toString();
    telemetryProps.includeOneDriveSites = args.options.includeOneDriveSites;
    return telemetryProps;
  }

  public defaultProperties(): string[] | undefined {
    return ['Title', 'Url'];
  }

  public commandAction(logger: Logger, args: CommandArgs, cb: (err?: any) => void): void {
    const webTemplate: string = args.options.webTemplate || '';
    const includeOneDriveSites: boolean = args.options.includeOneDriveSites || false;
    const personalSite: string = includeOneDriveSites === false ? '0' : '1';
    let spoAdminUrl: string = '';

    this
      .getSpoAdminUrl(logger, this.debug)
      .then((_spoAdminUrl: string): Promise<void> => {
        spoAdminUrl = _spoAdminUrl;

        if (this.verbose) {
          logger.logToStderr(`Retrieving list of site collections...`);
        }

        this.allSites = [];

        return this.getAllSites(spoAdminUrl, Utils.escapeXml(args.options.filter || ''), '0', personalSite, webTemplate, undefined, logger);
      })
      .then(_ => {
        logger.log(this.allSites);
        cb();
      }, (err: any): void => this.handleRejectedPromise(err, logger, cb));
  }

  private getAllSites(spoAdminUrl: string, filter: string | undefined, startIndex: string | undefined, personalSite: string, webTemplate: string, formDigest: FormDigestInfo | undefined, logger: Logger): Promise<void> {
    return new Promise<void>((resolve: () => void, reject: (error: any) => void): void => {
      this
        .ensureFormDigest(spoAdminUrl, logger, formDigest, this.debug)
        .then((res: FormDigestInfo): Promise<string> => {
          const requestOptions: any = {
            url: `${spoAdminUrl}/_vti_bin/client.svc/ProcessQuery`,
            headers: {
              'X-RequestDigest': res.FormDigestValue
            },
            data: `<Request AddExpandoFieldTypeSuffix="true" SchemaVersion="15.0.0.0" LibraryVersion="16.0.0.0" ApplicationName="${config.applicationName}" xmlns="http://schemas.microsoft.com/sharepoint/clientquery/2009"><Actions><ObjectPath Id="2" ObjectPathId="1" /><ObjectPath Id="4" ObjectPathId="3" /><Query Id="5" ObjectPathId="3"><Query SelectAllProperties="true"><Properties /></Query><ChildItemQuery SelectAllProperties="true"><Properties /></ChildItemQuery></Query></Actions><ObjectPaths><Constructor Id="1" TypeId="{268004ae-ef6b-4e9b-8425-127220d84719}" /><Method Id="3" ParentId="1" Name="GetSitePropertiesFromSharePointByFilters"><Parameters><Parameter TypeId="{b92aeee2-c92c-4b67-abcc-024e471bc140}"><Property Name="Filter" Type="String">${filter}</Property><Property Name="IncludeDetail" Type="Boolean">false</Property><Property Name="IncludePersonalSite" Type="Enum">${personalSite}</Property><Property Name="StartIndex" Type="String">${startIndex}</Property><Property Name="Template" Type="String">${webTemplate}</Property></Parameter></Parameters></Method></ObjectPaths></Request>`
          };

          return request.post(requestOptions);
        })
        .then((res: string): void => {
          const json: ClientSvcResponse = JSON.parse(res);
          const response: ClientSvcResponseContents = json[0];
          if (response.ErrorInfo) {
            reject(response.ErrorInfo.ErrorMessage);
            return;
          }
          else {
            const sites: SPOSitePropertiesEnumerable = json[json.length - 1];
            this.allSites!.push(...sites._Child_Items_);

            if (sites.NextStartIndexFromSharePoint) {
              this
                .getAllSites(spoAdminUrl, filter, sites.NextStartIndexFromSharePoint, personalSite, webTemplate, formDigest, logger)
                .then(_ => resolve(), err => reject(err));
            }
            else {
              resolve();
            }
          }
        }, err => reject(err));
    });
  }

  public options(): CommandOption[] {
    const options: CommandOption[] = [
      {
        option: '-t, --webTemplate [webTemplate]'
      },
      {
        option: '-f, --filter [filter]'
      },
      {
        option: '--includeOneDriveSites'
      }
    ];

    const parentOptions: CommandOption[] = super.options();
    return options.concat(parentOptions);
  }
}

module.exports = new SpoSiteClassicListCommand();